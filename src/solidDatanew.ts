import * as $rdf from "rdflib";
import {
  createContainerAt,
  overwriteFile,
  saveFileInContainer,
} from "@inrupt/solid-client";
import { getWebId, isLoggedIn, session, solidFetch } from "./auth";
import { CDM, getOntologyStore } from "./cdmnew";
import SHACLValidator from "rdf-validate-shacl";
import { runReasoning } from "./reasoner";
import type { DatasetCore } from "@rdfjs/types";
import { EMERGENCY_FILE, NGO_LIST_FILE } from "./solidPaths";

const EX = "http://example.org/ns#";
const EVIDENCE_URLS_PRED = $rdf.sym(EX + "evidenceUrls");

export type EmergencyData = {
  recordId: string;
  recordDate: string;
  victimId: string;
  victimCategory: string;
  numberOfVictims: string;
  nationality: string;
  victimGender: string;
  victimAge: string;
  groupNationalities: string;
  groupGenders: string;
  groupAges: string;
  country: string;
  state: string;
  town: string;
  village: string;
  latitude: string;
  longitude: string;
  locationId: string;
  locationName: string;
  locationType: string;
  situationDescription: string;
  accommodation: string;
  accommodationNeeds: string;
  needsDescription: string;
  captivityStatus: string;
  helpReasons: string;
  extraInfo: string;
  contactPhoneSelf: string;
  contactPhoneTrusted: string;
  contactMessenger: string;
  contactOtherHandles: string;
  contactRequest: string;
  gps: string;
  evidenceUrls: string;
//===============Editted==============
  trauma: string;      
  CaptivityDetail: string;             // New: Visible injuries (multiple selection)
  healthStatus: string;             // New: Health condition (free text)
  //===============Newly added Features==============
};

function addTripleIf(
  store: $rdf.IndexedFormula,
  subject: $rdf.NamedNode,
  predicate: $rdf.NamedNode,
  value: string,
): void {
  if (value) {
    store.add(subject, predicate, $rdf.lit(value));
  }
}

// Helper for multi-select fields (needs & trauma)
function addMultiValueIf(
  store: $rdf.IndexedFormula,
  subject: $rdf.NamedNode,
  predicate: $rdf.NamedNode,
  value: string | string[] | undefined
): void {
  const val = typeof value === "string" 
    ? value 
    : Array.isArray(value) ? value.join("; ") : "";
  
  if (val) {
    store.add(subject, predicate, $rdf.lit(val));
  }
}

async function validateData(store: $rdf.IndexedFormula): Promise<void> {
  try {
    const response = await fetch("/shapes.ttl");
    if (!response.ok) {
      console.warn("Could not load shapes.ttl for validation");
      return;
    }
    const shapesText = await response.text();
    const shapesStore = $rdf.graph();

    try {
      $rdf.parse(
        shapesText,
        shapesStore,
        window.location.origin + "/shapes.ttl",
        "text/turtle",
      );
    } catch (e) {
      console.error("Failed to parse shapes.ttl", e);
      return;
    }

    const shapesDataset = shapesStore.statements as unknown as DatasetCore;
    const dataDataset = store.statements as unknown as DatasetCore;

    const validator = new SHACLValidator(shapesDataset);
    const report = await validator.validate(dataDataset);

    if (!report.conforms) {
      console.error("SHACL Validation Report:", report);
      let msg = "Validation failed:\n";
      for (const result of report.results) {
        msg += `- ${result.message}\n`;
      }
      throw new Error(msg);
    }
    console.log("SHACL Validation passed");
  } catch (error) {
    if ((error as Error).message.startsWith("Validation failed")) {
      throw error;
    }
    console.error("Validation error:", error);
  }
}

async function ensurePublicContainer(podBaseUrl: string): Promise<void> {
  const base = podBaseUrl.endsWith("/") ? podBaseUrl : `${podBaseUrl}/`;
  const publicUrl = `${base}public/`;
  const head = await session.fetch(publicUrl, { method: "HEAD" });
  if (head.ok || head.status === 403 || head.status === 405 || head.status === 401) {
    return;
  }
  if (head.status === 404) {
    await createContainerAt(publicUrl, { fetch: session.fetch });
  }
}

export async function saveEmergencyData(
  podBaseUrl: string,
  data: EmergencyData,
): Promise<string> {
  if (!podBaseUrl) {
    throw new Error(
      "Pod URL is missing. Please log out and log in again, then save.",
    );
  }
  if (!isLoggedIn()) {
    throw new Error(
      "Failed to save: 401 Unauthorized. Please log out and log in again, then save.",
    );
  }

  const webId = getWebId();
  if (webId) {
    const podOrigin = new URL(podBaseUrl).origin;
    const webOrigin = new URL(webId).origin;
    if (podOrigin !== webOrigin) {
      throw new Error(
        `Login and Pod do not match. You are logged in as ${webId} but the Pod field is ${podBaseUrl}. Log in with the refugee account, or put this Pod URL: ${webOrigin}/`,
      );
    }
  }

  await ensurePublicContainer(podBaseUrl);

  const fileUrl = `${podBaseUrl.endsWith("/") ? podBaseUrl : `${podBaseUrl}/`}${EMERGENCY_FILE.replace(/^\/+/, "")}`;

  const store = $rdf.graph();

  const recordNode = $rdf.sym(`${fileUrl}#record`);
  const victimNode = $rdf.sym(`${fileUrl}#victim`);
  const locationNode = $rdf.sym(`${fileUrl}#location`);
  const situationNode = $rdf.sym(`${fileUrl}#situation`);

  const RDF_TYPE = $rdf.sym("http://www.w3.org/1999/02/22-rdf-syntax-ns#type");

  // Record
  store.add(recordNode, RDF_TYPE, CDM.Record);
  addTripleIf(store, recordNode, CDM.id, data.recordId);
  addTripleIf(store, recordNode, CDM.updatedAt, data.recordDate);

  // Victim
  store.add(recordNode, CDM.hasVictim, victimNode);
  store.add(recordNode, CDM.hasLocation, locationNode);
  store.add(recordNode, CDM.hasSituation, situationNode);

  store.add(victimNode, RDF_TYPE, CDM.Victim);
  addTripleIf(store, victimNode, CDM.victimId, data.victimId);
  addTripleIf(store, victimNode, CDM.category, data.victimCategory);
  addTripleIf(store, victimNode, CDM.number, data.numberOfVictims);
  addTripleIf(store, victimNode, CDM.nationality, data.nationality);
  addTripleIf(store, victimNode, CDM.gender, data.victimGender);
  addTripleIf(store, victimNode, CDM.age, data.victimAge);
  addTripleIf(store, victimNode, CDM.groupNationalities, data.groupNationalities);
  addTripleIf(store, victimNode, CDM.groupGenders, data.groupGenders);
  addTripleIf(store, victimNode, CDM.groupAges, data.groupAges);

  // Location
  store.add(locationNode, RDF_TYPE, CDM.Location);
  addTripleIf(store, locationNode, CDM.country, data.country);
  addTripleIf(store, locationNode, CDM.state, data.state);
  addTripleIf(store, locationNode, CDM.town, data.town);
  addTripleIf(store, locationNode, CDM.village, data.village);
  addTripleIf(store, locationNode, CDM.latitude, data.latitude);
  addTripleIf(store, locationNode, CDM.longitude, data.longitude);
  addTripleIf(store, locationNode, CDM.locationId, data.locationId);
  addTripleIf(store, locationNode, CDM.locationName, data.locationName);
  addTripleIf(store, locationNode, CDM.locationType, data.locationType);

  // Situation
  store.add(situationNode, RDF_TYPE, CDM.Situation);
  addTripleIf(store, situationNode, CDM.description, data.situationDescription);
  addTripleIf(store, situationNode, CDM.accommodation, data.accommodation);
  addTripleIf(store, situationNode, CDM.accommodationNeeds, data.accommodationNeeds);


  addTripleIf(store, situationNode, CDM.needsDescription, data.needsDescription);
  addTripleIf(store, situationNode, CDM.captivityStatus, data.captivityStatus);
  addTripleIf(store, situationNode, CDM.helpReasons, data.helpReasons);

  addTripleIf(store, situationNode, CDM.extraInfo, data.extraInfo);
  addTripleIf(store, situationNode, CDM.contactPhoneSelf, data.contactPhoneSelf);
  addTripleIf(store, situationNode, CDM.contactPhoneTrusted, data.contactPhoneTrusted);
  addTripleIf(store, situationNode, CDM.contactMessenger, data.contactMessenger);
  addTripleIf(store, situationNode, CDM.contactOtherHandles, data.contactOtherHandles);
  addTripleIf(store, situationNode, CDM.contactRequest, data.contactRequest);


  //===============New Fields==============
  // New fields: Trauma and Health Status
  addMultiValueIf(store, situationNode, CDM.trauma, data.trauma);
  addTripleIf(store, situationNode, CDM.healthStatus, data.healthStatus);
  addTripleIf(store,situationNode, CDM.CaptivityDetail,data.CaptivityDetail)
//=============================


  addTripleIf(store, situationNode, EVIDENCE_URLS_PRED, data.evidenceUrls);

  // VALIDATE
  await validateData(store);

  const serialized =
    $rdf.serialize(null, store, fileUrl, "text/turtle") ?? "";
  const blob = new Blob([serialized], { type: "text/turtle" });
  const authFetch: typeof fetch = (input, init) => session.fetch(input, init);
  const publicUrl = `${podBaseUrl.endsWith("/") ? podBaseUrl : `${podBaseUrl}/`}public/`;

  try {
    await saveFileInContainer(publicUrl, blob, {
      slug: "emergency-record.ttl",
      contentType: "text/turtle",
      fetch: authFetch,
    });
    return fileUrl;
  } catch (postErr: unknown) {
    try {
      await overwriteFile(fileUrl, blob, {
        contentType: "text/turtle",
        fetch: authFetch,
      });
      return fileUrl;
    } catch (err: unknown) {
      const postMsg = postErr instanceof Error ? postErr.message : String(postErr);
      const putMsg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to save as ${webId ?? "unknown user"}. POST ${publicUrl}: ${postMsg} | PUT ${fileUrl}: ${putMsg}`,
      );
    }
  }
}

export async function loadEmergencyData(
  podBaseUrl: string,
): Promise<EmergencyData | null> {
  const fileUrl = `${podBaseUrl}${EMERGENCY_FILE}`;

  let ttlContent: string;
  try {
    const response = await solidFetch(fileUrl);
    if (!response.ok) {
      return null;
    }
    ttlContent = await response.text();
  } catch {
    return null;
  }

  const store = $rdf.graph();
  try {
    $rdf.parse(ttlContent, store, fileUrl, "text/turtle");

    // REASONING
    const ontologyStore = getOntologyStore();
    if (ontologyStore) {
      await runReasoning(store, ontologyStore);
    }
  } catch (error) {
    console.error("Failed to parse RDF:", error);
    return null;
  }

  const recordNode = $rdf.sym(`${fileUrl}#record`);
  const victimNode = $rdf.sym(`${fileUrl}#victim`);
  const locationNode = $rdf.sym(`${fileUrl}#location`);
  const situationNode = $rdf.sym(`${fileUrl}#situation`);

  const getLiteral = (
    subject: $rdf.NamedNode,
    predicate: $rdf.NamedNode,
  ): string => {
    const value = store.any(subject, predicate, null);
    return value?.value || "";
  };

  const recordId = getLiteral(recordNode, CDM.id);
  const recordDate = getLiteral(recordNode, CDM.updatedAt);

  const victimId = getLiteral(victimNode, CDM.victimId);
  const victimCategory = getLiteral(victimNode, CDM.category);
  const numberOfVictims = getLiteral(victimNode, CDM.number);
  const nationality = getLiteral(victimNode, CDM.nationality);
  const victimGender = getLiteral(victimNode, CDM.gender);
  const victimAge = getLiteral(victimNode, CDM.age);
  const groupNationalities = getLiteral(victimNode, CDM.groupNationalities);
  const groupGenders = getLiteral(victimNode, CDM.groupGenders);
  const groupAges = getLiteral(victimNode, CDM.groupAges);

  const country = getLiteral(locationNode, CDM.country);
  const state = getLiteral(locationNode, CDM.state);
  const town = getLiteral(locationNode, CDM.town);
  const village = getLiteral(locationNode, CDM.village);
  const latitude = getLiteral(locationNode, CDM.latitude);
  const longitude = getLiteral(locationNode, CDM.longitude);
  const locationId = getLiteral(locationNode, CDM.locationId);
  const locationName = getLiteral(locationNode, CDM.locationName);
  const locationType = getLiteral(locationNode, CDM.locationType);

  const situationDescription = getLiteral(situationNode, CDM.description);
  const accommodation = getLiteral(situationNode, CDM.accommodation);
 const accommodationNeeds = getLiteral(situationNode, CDM.accommodationNeeds);
  const needsDescription = getLiteral(situationNode, CDM.needsDescription);
  const captivityStatus = getLiteral(situationNode, CDM.captivityStatus);
  const helpReasons = getLiteral(situationNode, CDM.helpReasons);

  const extraInfo = getLiteral(situationNode, CDM.extraInfo);
  const contactPhoneSelf = getLiteral(situationNode, CDM.contactPhoneSelf);
  const contactPhoneTrusted = getLiteral(situationNode, CDM.contactPhoneTrusted);
  const contactMessenger = getLiteral(situationNode, CDM.contactMessenger);
  const contactOtherHandles = getLiteral(situationNode, CDM.contactOtherHandles);
  const contactRequest = getLiteral(situationNode, CDM.contactRequest);
     const CaptivityDetail = getLiteral(situationNode, CDM.CaptivityDetail);
   //const Needs=getLiteral(situationNode,CDM.needs);

  const evidenceUrls = getLiteral(situationNode, EVIDENCE_URLS_PRED);

  const gps = latitude && longitude ? `${latitude}, ${longitude}` : "";

  return {
    recordId,
    recordDate,
    victimId,
    victimCategory,
    numberOfVictims,
    nationality,
    victimGender,
    victimAge,
    groupNationalities,
    groupGenders,
    groupAges,
    country,
    state,
    town,
    village,
    latitude,
    longitude,
    locationId,
    locationName,
    locationType,
    situationDescription,
    accommodation,
    accommodationNeeds,
    needsDescription,
    captivityStatus,
    CaptivityDetail,
    helpReasons,
    extraInfo,
    contactPhoneSelf,
    contactPhoneTrusted,
    contactMessenger,
    contactOtherHandles,
    contactRequest,
    gps,
    evidenceUrls,
     

    // Updated fields returned
    trauma: getLiteral(situationNode, CDM.trauma),
    healthStatus: getLiteral(situationNode, CDM.healthStatus),
  };
}

export async function saveNgoList(
  podBaseUrl: string,
  ngos: string[],
): Promise<string> {
  const fileUrl = `${podBaseUrl}${NGO_LIST_FILE}`;
  const store = $rdf.graph();

  const listNode = $rdf.sym(`${fileUrl}#ngoList`);
  const RDF_TYPE = $rdf.sym("http://www.w3.org/1999/02/22-rdf-syntax-ns#type");
  const HAS_NGO = $rdf.sym("http://example.org/ns/hasNGO");

  store.add(listNode, RDF_TYPE, $rdf.sym("http://example.org/ns/NgoList"));

  ngos.forEach((ngoLabel) => {
    store.add(listNode, HAS_NGO, $rdf.literal(ngoLabel));
  });

  const serialized = $rdf.serialize(null, store, fileUrl, "text/turtle");

  const response = await solidFetch(fileUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "text/turtle",
    },
    body: serialized,
  });

  if (!response.ok) {
    throw new Error(`Failed to save NGO list: ${response.status} ${response.statusText}`);
  }

  return fileUrl;
}

export async function loadNgoList(
  podBaseUrl: string,
): Promise<string[] | null> {
  const fileUrl = `${podBaseUrl}${NGO_LIST_FILE}`;
  let ttlContent: string;
  try {
    const response = await solidFetch(fileUrl);
    if (!response.ok) {
      return null;
    }
    ttlContent = await response.text();
  } catch {
    return null;
  }

  const store = $rdf.graph();
  try {
    $rdf.parse(ttlContent, store, fileUrl, "text/turtle");
  } catch (error) {
    console.error("Failed to parse NGO list RDF:", error);
    return null;
  }

  const listNode = $rdf.sym(`${fileUrl}#ngoList`);
  const HAS_NGO = $rdf.sym("http://example.org/ns/hasNGO");

  const ngos = store.each(listNode, HAS_NGO, null).map((ngo) => ngo.value);

  return ngos;
}
