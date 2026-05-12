// Default maximum number of features to fetch
const DEFAULT_MAX_FEATURES = 500;
const WFS_PROXY_PATH = "/api/wfs-proxy";

// Maximum length of error response body to include in error messages
const ERROR_BODY_PREVIEW_LENGTH = 500;
const UNSUPPORTED_FORMAT_PREVIEW_LENGTH = 200;

// Supported WFS versions, ordered by preference
const SUPPORTED_WFS_VERSIONS = ["2.0.0", "1.1.0", "1.0.0"] as const;

export interface LayerInfo {
  id: string;
  title: string;
  abstract?: string;
  projections: string[];
  defaultProjection?: string;
  outputFormats?: string[];
  serviceVersion?: string;
  namespaceUri?: string;
  bounds?: {
    minx: number;
    miny: number;
    maxx: number;
    maxy: number;
    crs?: string;
  };
  keywords?: string[];
  contactPerson?: string;
  contactOrganization?: string;
  contactEmail?: string;
  fees?: string;
  accessConstraints?: string;
  metadataUrl?: string;
}

export type SchemaInfo = {
  attributes: {
    name: string;
    type: string;
    nillable?: boolean;
    minOccurs?: number;
    maxOccurs?: number | "unbounded";
  }[];
};

function getHeaderValue(
  headers: HeadersInit | undefined,
  name: string
): string | null {
  if (!headers) return null;

  if (headers instanceof Headers) {
    return headers.get(name);
  }

  if (Array.isArray(headers)) {
    const entry = headers.find(
      ([key]) => key.toLowerCase() === name.toLowerCase()
    );
    return entry?.[1] ?? null;
  }

  const record = headers as Record<string, string | undefined>;

  const direct = record[name];
  if (direct) return direct;

  const matchedKey = Object.keys(record).find(
    (key) => key.toLowerCase() === name.toLowerCase()
  );

  return matchedKey ? (record[matchedKey] ?? null) : null;
}

function isLikelyCorsError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    (error.message.includes("Failed to fetch") ||
      error.message.includes("Load failed") ||
      error.message.includes("NetworkError"))
  );
}

async function fetchWithCorsProxy(
  url: string,
  init?: RequestInit
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (typeof window === "undefined" || !isLikelyCorsError(error)) {
      throw error;
    }

    const proxyUrl = new URL(WFS_PROXY_PATH, window.location.origin);
    proxyUrl.searchParams.set("url", url);

    const accept = getHeaderValue(init?.headers, "Accept");
    if (accept) {
      proxyUrl.searchParams.set("accept", accept);
    }

    console.warn(
      "Direct WFS request failed due to likely CORS/network restrictions. Retrying through proxy.",
      url
    );

    return fetch(proxyUrl.toString(), {
      method: "GET",
      cache: "no-store"
    });
  }
}

function parseXmlOrThrow(xmlText: string, label = "XML"): XMLDocument {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "application/xml");

  const parserError = Array.from(xmlDoc.getElementsByTagName("*")).find(
    (el) => el.localName === "parsererror"
  );

  if (parserError) {
    throw new Error(
      `Failed to parse ${label}: ${parserError.textContent?.trim()}`
    );
  }

  return xmlDoc;
}

function allByLocalName(root: ParentNode, localName: string): Element[] {
  // Use getElementsByTagNameNS for better performance than filtering all descendants.
  // Works on both Document and Element nodes.
  if (
    typeof (root as Element).getElementsByTagNameNS === "function" ||
    typeof (root as XMLDocument).getElementsByTagNameNS === "function"
  ) {
    const collection = (
      root as Element | XMLDocument
    ).getElementsByTagNameNS("*", localName);
    return Array.from(collection);
  }

  return Array.from(root.querySelectorAll("*")).filter(
    (el) => el.localName === localName
  );
}

function allByLocalNames(root: ParentNode, localNames: string[]): Element[] {
  const wanted = new Set(localNames);

  return Array.from(root.querySelectorAll("*")).filter((el) =>
    wanted.has(el.localName)
  );
}

function elementsIncludingRoot(root: ParentNode, localName: string): Element[] {
  const result: Element[] = [];

  if (root instanceof Element && root.localName === localName) {
    result.push(root);
  }

  result.push(...allByLocalName(root, localName));
  return result;
}

function firstByLocalName(
  root: ParentNode,
  localName: string
): Element | undefined {
  return allByLocalName(root, localName)[0];
}

function childrenByLocalName(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((el) => el.localName === localName);
}

function firstChildByLocalName(
  parent: Element,
  localName: string
): Element | undefined {
  return childrenByLocalName(parent, localName)[0];
}

function firstChildText(
  parent: Element,
  localName: string
): string | undefined {
  return firstChildByLocalName(parent, localName)?.textContent?.trim();
}

function attr(el: Element, localName: string): string | null {
  for (const attribute of Array.from(el.attributes)) {
    if (attribute.localName === localName || attribute.name === localName) {
      return attribute.value;
    }
  }

  return null;
}

function normalizeCrs(crs: string): string {
  if (crs.startsWith("urn:ogc:def:crs:EPSG:")) {
    return `EPSG:${crs.split(":").pop()}`;
  }

  if (crs.startsWith("http://www.opengis.net/def/crs/EPSG/")) {
    return `EPSG:${crs.split("/").pop()}`;
  }

  if (crs.startsWith("http://www.opengis.net/gml/srs/epsg.xml#")) {
    return `EPSG:${crs.split("#").pop()}`;
  }

  return crs;
}

function getNamespaceForQName(
  context: Element,
  qname: string
): string | undefined {
  if (!qname.includes(":")) return undefined;

  const prefix = qname.split(":")[0];
  let el: Element | null = context;

  while (el) {
    const namespace = el.getAttribute(`xmlns:${prefix}`);
    if (namespace) return namespace;
    el = el.parentElement;
  }

  return undefined;
}

function getOgcExceptionMessage(xmlDoc: XMLDocument): string | null {
  const root = xmlDoc.documentElement;

  const exceptionReport =
    root.localName === "ExceptionReport" ||
    root.localName === "ServiceExceptionReport"
      ? root
      : firstByLocalName(xmlDoc, "ExceptionReport") ||
        firstByLocalName(xmlDoc, "ServiceExceptionReport");

  if (!exceptionReport) return null;

  const texts = allByLocalName(exceptionReport, "ExceptionText")
    .concat(allByLocalName(exceptionReport, "ServiceException"))
    .map((el) => el.textContent?.trim())
    .filter((value): value is string => Boolean(value));

  return texts.length > 0
    ? texts.join("\n")
    : exceptionReport.textContent?.trim() || "Unknown OGC exception";
}

function createRequestUrl(
  baseUrl: string,
  requestParams: URLSearchParams
): string {
  const url = new URL(baseUrl);

  // Fully clean the input URL:
  // keep only origin + pathname, discard all existing query params.
  return `${url.origin}${url.pathname}?${requestParams.toString()}`;
}

function getPreferredCapabilitiesVersions(baseUrl: string): string[] {
  const url = new URL(baseUrl);
  const requestedVersion =
    url.searchParams.get("version") || url.searchParams.get("VERSION");

  return Array.from(
    new Set(
      [
        requestedVersion,
        ...SUPPORTED_WFS_VERSIONS,
      ].filter((value): value is string => Boolean(value))
    )
  );
}

function isWfs2(version?: string): boolean {
  return Boolean(version?.startsWith("2."));
}

/**
 * Try an async operation across multiple WFS versions, returning the first success.
 * Throws the last error encountered if all attempts fail.
 */
async function tryAcrossVersions<T>(
  versions: string[],
  attempt: (version: string) => Promise<T>,
  errorContext: string
): Promise<T> {
  let lastError: unknown;

  for (const version of versions) {
    try {
      return await attempt(version);
    } catch (error) {
      lastError = error;
      console.warn(`${errorContext} failed for WFS ${version}`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${errorContext} failed for all attempted WFS versions.`);
}

function getEffectiveVersions(
  baseUrl: string,
  layer?: LayerInfo
): string[] {
  return Array.from(
    new Set(
      [
        layer?.serviceVersion,
        ...getPreferredCapabilitiesVersions(baseUrl),
      ].filter((value): value is string => Boolean(value))
    )
  );
}

function buildCapabilitiesParams(version: string): URLSearchParams {
  const params = new URLSearchParams();
  params.set("service", "WFS");
  params.set("version", version);
  params.set("request", "GetCapabilities");
  return params;
}

function buildDescribeFeatureTypeParams(options: {
  version?: string;
  typeName: string;
  namespaceUri?: string;
}): URLSearchParams {
  const version = options.version || "2.0.0";

  const params = new URLSearchParams();
  params.set("service", "WFS");
  params.set("version", version);
  params.set("request", "DescribeFeatureType");

  if (isWfs2(version)) {
    params.set("typeNames", options.typeName);
  } else {
    params.set("typeName", options.typeName);
  }

  if (
    isWfs2(version) &&
    options.namespaceUri &&
    options.typeName.includes(":")
  ) {
    const prefix = options.typeName.split(":")[0];
    params.set("namespaces", `xmlns(${prefix},${options.namespaceUri})`);
  }

  return params;
}

function buildGetFeatureParams(options: {
  version?: string;
  layerId: string;
  outputFormat?: string;
  maxFeatures?: number;
  srsName?: string;
  resultType?: "results" | "hits";
  namespaceUri?: string;
}): URLSearchParams {
  const version = options.version || "2.0.0";

  const params = new URLSearchParams();
  params.set("service", "WFS");
  params.set("version", version);
  params.set("request", "GetFeature");

  if (isWfs2(version)) {
    params.set("typeNames", options.layerId);

    if (options.maxFeatures !== undefined) {
      params.set("count", String(options.maxFeatures));
    }
  } else {
    params.set("typeName", options.layerId);

    if (options.maxFeatures !== undefined) {
      params.set("maxFeatures", String(options.maxFeatures));
    }
  }

  if (options.resultType) {
    params.set("resultType", options.resultType);
  }

  if (options.outputFormat) {
    params.set("outputFormat", options.outputFormat);
  }

  if (options.srsName) {
    params.set("srsName", options.srsName);
  }

  if (
    isWfs2(version) &&
    options.namespaceUri &&
    options.layerId.includes(":")
  ) {
    const prefix = options.layerId.split(":")[0];
    params.set("namespaces", `xmlns(${prefix},${options.namespaceUri})`);
  }

  return params;
}

export async function fetchWfsCapabilities(
  baseUrl: string
): Promise<LayerInfo[]> {
  return tryAcrossVersions(
    getPreferredCapabilitiesVersions(baseUrl),
    async (version) => {
      const capabilitiesUrl = createRequestUrl(
        baseUrl,
        buildCapabilitiesParams(version)
      );

      console.log("Fetching WFS capabilities from:", capabilitiesUrl);

      const response = await fetchWithCorsProxy(capabilitiesUrl, {
        method: "GET",
        headers: {
          Accept: "application/xml,text/xml,*/*"
        }
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(
          `Failed to fetch WFS capabilities: ${response.status} ${response.statusText}\n${text.slice(
            0,
            ERROR_BODY_PREVIEW_LENGTH
          )}`
        );
      }

      return parseCapabilitiesXml(text);
    },
    "Capabilities request"
  );
}

function parseCapabilitiesXml(xmlText: string): LayerInfo[] {
  const xmlDoc = parseXmlOrThrow(xmlText, "WFS capabilities");

  const exceptionMessage = getOgcExceptionMessage(xmlDoc);
  if (exceptionMessage) {
    throw new Error(`WFS service exception: ${exceptionMessage}`);
  }

  const root = xmlDoc.documentElement;

  if (root.localName !== "WFS_Capabilities") {
    throw new Error(
      `Response is not a WFS capabilities document. Root element was <${root.localName}>.`
    );
  }

  const serviceVersion = root.getAttribute("version") || "unknown";

  const serviceProviderNode = firstByLocalName(xmlDoc, "ServiceProvider");
  const serviceIdentificationNode = firstByLocalName(
    xmlDoc,
    "ServiceIdentification"
  );

  const contactOrganization =
    serviceProviderNode && firstChildText(serviceProviderNode, "ProviderName");

  const serviceContactNode =
    serviceProviderNode &&
    firstByLocalName(serviceProviderNode, "ServiceContact");

  const contactPerson =
    serviceContactNode && firstChildText(serviceContactNode, "IndividualName");

  const contactEmailNode =
    serviceContactNode &&
    firstByLocalName(serviceContactNode, "ElectronicMailAddress");

  const contactEmail = contactEmailNode?.textContent?.trim();

  const fees =
    serviceIdentificationNode &&
    firstChildText(serviceIdentificationNode, "Fees");

  const accessConstraints =
    serviceIdentificationNode &&
    firstChildText(serviceIdentificationNode, "AccessConstraints");

  const globalOutputFormats = extractGlobalOutputFormats(xmlDoc);

  const featureTypeList = firstByLocalName(xmlDoc, "FeatureTypeList");

  const featureTypeNodes = featureTypeList
    ? childrenByLocalName(featureTypeList, "FeatureType")
    : allByLocalName(xmlDoc, "FeatureType");

  if (featureTypeNodes.length === 0) {
    throw new Error(
      "Valid WFS capabilities document, but no FeatureType elements were found."
    );
  }

  const layers: LayerInfo[] = [];

  for (const node of featureTypeNodes) {
    const layerId = firstChildText(node, "Name");
    if (!layerId) continue;

    const title = firstChildText(node, "Title") || layerId;
    const abstract = firstChildText(node, "Abstract");
    const namespaceUri = getNamespaceForQName(node, layerId);

    const crsNodes = Array.from(node.children).filter((el) =>
      ["DefaultCRS", "OtherCRS", "DefaultSRS", "OtherSRS", "SRS"].includes(
        el.localName
      )
    );

    const projections = Array.from(
      new Set(
        crsNodes
          .map((el) => el.textContent?.trim())
          .filter((value): value is string => Boolean(value))
          .map(normalizeCrs)
      )
    );

    let defaultProjection = crsNodes
      .find((el) => ["DefaultCRS", "DefaultSRS", "SRS"].includes(el.localName))
      ?.textContent?.trim();

    if (defaultProjection) {
      defaultProjection = normalizeCrs(defaultProjection);
    }

    if (!defaultProjection && projections.length > 0) {
      defaultProjection = projections[0];
    }

    const layerOutputFormats = extractLayerOutputFormats(node);

    const keywords = allByLocalName(node, "Keyword")
      .map((el) => el.textContent?.trim())
      .filter((value): value is string => Boolean(value));

    const bounds = extractBounds(node);
    const metadataUrl = extractMetadataUrl(node);

    layers.push({
      id: layerId,
      title,
      abstract,
      projections,
      defaultProjection,
      outputFormats:
        layerOutputFormats.length > 0
          ? layerOutputFormats
          : globalOutputFormats,
      serviceVersion,
      namespaceUri,
      bounds,
      keywords,
      contactPerson: contactPerson || undefined,
      contactOrganization: contactOrganization || undefined,
      contactEmail,
      fees: fees || undefined,
      accessConstraints: accessConstraints || undefined,
      metadataUrl
    });
  }

  return layers;
}

function extractGlobalOutputFormats(xmlDoc: XMLDocument): string[] {
  const formats = new Set<string>();

  const getFeatureOperations = allByLocalName(xmlDoc, "Operation").filter(
    (el) => el.getAttribute("name") === "GetFeature"
  );

  for (const operation of getFeatureOperations) {
    const outputFormatParams = allByLocalName(operation, "Parameter").filter(
      (el) => el.getAttribute("name") === "outputFormat"
    );

    for (const param of outputFormatParams) {
      for (const valueNode of allByLocalName(param, "Value")) {
        const value = valueNode.textContent?.trim();
        if (value) formats.add(value);
      }
    }
  }

  // Older WFS style: GetFeature > ResultFormat > GML2 / GML3 / JSON-like child nodes
  for (const getFeatureNode of allByLocalName(xmlDoc, "GetFeature")) {
    for (const formatNode of allByLocalName(getFeatureNode, "Format")) {
      const value = formatNode.textContent?.trim();
      if (value) formats.add(value);
    }

    for (const resultFormatNode of allByLocalName(
      getFeatureNode,
      "ResultFormat"
    )) {
      for (const child of Array.from(resultFormatNode.children)) {
        if (child.localName) formats.add(child.localName);
      }
    }
  }

  return Array.from(formats);
}

function extractLayerOutputFormats(featureTypeNode: Element): string[] {
  const formats = new Set<string>();

  const outputFormatsNode = firstByLocalName(featureTypeNode, "OutputFormats");
  if (!outputFormatsNode) return [];

  for (const formatNode of allByLocalName(outputFormatsNode, "Format")) {
    const value = formatNode.textContent?.trim();
    if (value) formats.add(value);
  }

  for (const outputFormatNode of allByLocalName(
    outputFormatsNode,
    "OutputFormat"
  )) {
    const value = outputFormatNode.textContent?.trim();
    if (value) formats.add(value);
  }

  return Array.from(formats);
}

function extractBounds(node: Element): LayerInfo["bounds"] | undefined {
  const wgsBox = firstByLocalName(node, "WGS84BoundingBox");

  if (wgsBox) {
    const lower = firstByLocalName(wgsBox, "LowerCorner")
      ?.textContent?.trim()
      .split(/\s+/)
      .map(Number);

    const upper = firstByLocalName(wgsBox, "UpperCorner")
      ?.textContent?.trim()
      .split(/\s+/)
      .map(Number);

    if (lower?.length === 2 && upper?.length === 2) {
      return {
        minx: lower[0],
        miny: lower[1],
        maxx: upper[0],
        maxy: upper[1],
        crs: "EPSG:4326"
      };
    }
  }

  const latLongBox = firstByLocalName(node, "LatLongBoundingBox");

  if (latLongBox) {
    const minx = Number(latLongBox.getAttribute("minx"));
    const miny = Number(latLongBox.getAttribute("miny"));
    const maxx = Number(latLongBox.getAttribute("maxx"));
    const maxy = Number(latLongBox.getAttribute("maxy"));

    if ([minx, miny, maxx, maxy].every(Number.isFinite)) {
      return {
        minx,
        miny,
        maxx,
        maxy,
        crs: "EPSG:4326"
      };
    }
  }

  const boundingBox = firstByLocalName(node, "BoundingBox");

  if (boundingBox) {
    const lower = firstByLocalName(boundingBox, "LowerCorner")
      ?.textContent?.trim()
      .split(/\s+/)
      .map(Number);

    const upper = firstByLocalName(boundingBox, "UpperCorner")
      ?.textContent?.trim()
      .split(/\s+/)
      .map(Number);

    if (lower?.length === 2 && upper?.length === 2) {
      return {
        minx: lower[0],
        miny: lower[1],
        maxx: upper[0],
        maxy: upper[1],
        crs:
          boundingBox.getAttribute("crs") ||
          boundingBox.getAttribute("SRS") ||
          undefined
      };
    }
  }

  return undefined;
}

function extractMetadataUrl(node: Element): string | undefined {
  const metadataUrlNode = firstByLocalName(node, "MetadataURL");
  if (!metadataUrlNode) return undefined;

  const onlineResource = firstByLocalName(metadataUrlNode, "OnlineResource");

  if (onlineResource) {
    return (
      attr(onlineResource, "href") ||
      onlineResource.getAttribute("xlink:href") ||
      undefined
    );
  }

  return (
    attr(metadataUrlNode, "href") ||
    metadataUrlNode.getAttribute("xlink:href") ||
    undefined
  );
}

export async function fetchDescribeFeatureType(
  baseUrl: string,
  typeName: string,
  layer?: LayerInfo
): Promise<SchemaInfo> {
  return tryAcrossVersions(
    getEffectiveVersions(baseUrl, layer),
    async (version) => {
      const describeUrl = createRequestUrl(
        baseUrl,
        buildDescribeFeatureTypeParams({
          version,
          typeName,
          namespaceUri: layer?.namespaceUri
        })
      );

      console.log("Fetching DescribeFeatureType from:", describeUrl);

      const response = await fetchWithCorsProxy(describeUrl, {
        method: "GET",
        headers: {
          Accept: "application/xml,text/xml,*/*"
        }
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(
          `Failed to fetch DescribeFeatureType: ${response.status} ${response.statusText}\n${text.slice(
            0,
            ERROR_BODY_PREVIEW_LENGTH
          )}`
        );
      }

      return parseDescribeFeatureTypeXml(text);
    },
    `DescribeFeatureType for type ${typeName}`
  );
}

export function parseDescribeFeatureTypeXml(xmlText: string): SchemaInfo {
  const xmlDoc = parseXmlOrThrow(xmlText, "DescribeFeatureType response");

  const exceptionMessage = getOgcExceptionMessage(xmlDoc);
  if (exceptionMessage) {
    throw new Error(`WFS service exception: ${exceptionMessage}`);
  }

  const schemaEl =
    xmlDoc.documentElement.localName === "schema"
      ? xmlDoc.documentElement
      : firstByLocalName(xmlDoc, "schema");

  if (!schemaEl) {
    throw new Error(
      "Invalid DescribeFeatureType response: no <schema> element found."
    );
  }

  const elements = allByLocalName(schemaEl, "element");

  const attributes = elements
    .map((el) => {
      const name = el.getAttribute("name");
      const type = el.getAttribute("type");

      if (!name || !type) return null;

      const nillable = el.getAttribute("nillable") === "true";

      const minOccursRaw = el.getAttribute("minOccurs");
      const maxOccursRaw = el.getAttribute("maxOccurs");

      const minOccurs = minOccursRaw ? Number(minOccursRaw) : undefined;

      const maxOccurs =
        maxOccursRaw === "unbounded"
          ? "unbounded"
          : maxOccursRaw
            ? Number(maxOccursRaw)
            : undefined;

      return {
        name,
        type,
        nillable,
        minOccurs,
        maxOccurs
      };
    })
    .filter((field): field is NonNullable<typeof field> => Boolean(field));

  return { attributes };
}

function buildOutputFormatAttempts(
  layer?: LayerInfo
): Array<string | undefined> {
  const advertised = (layer?.outputFormats || [])
    .map((format) => format.trim())
    .filter(Boolean);

  const jsonAdvertised = advertised.filter((format) =>
    /json|geojson/i.test(format)
  );

  const otherAdvertised = advertised.filter(
    (format) => !/json|geojson/i.test(format)
  );

  const fallbacks: Array<string | undefined> = [
    "application/json",
    "application/geo+json",
    "json",
    "GEOJSON",
    "application/gml+xml; version=3.2",
    "text/xml; subtype=gml/3.2",
    "text/xml; subtype=gml/3.1.1",
    "GML3",
    "GML2",
    undefined // Let the server choose its default.
  ];

  const seen = new Set<string>();

  return [...jsonAdvertised, ...otherAdvertised, ...fallbacks].filter(
    (format) => {
      const key = format || "__server_default__";
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }
  );
}

export async function fetchWfsData(
  baseUrl: string,
  layerId: string,
  maxFeatures: number = DEFAULT_MAX_FEATURES,
  layer?: LayerInfo
) {
  const versions = getEffectiveVersions(baseUrl, layer);

  const sourceProjection =
    layer?.defaultProjection || layer?.projections?.[0] || undefined;

  const effectiveMaxFeatures =
    maxFeatures === 0 ? undefined : Math.max(1, maxFeatures);

  const outputFormatAttempts = buildOutputFormatAttempts(layer);

  let lastError: unknown;

  for (const version of versions) {
    for (const outputFormat of outputFormatAttempts) {
      const params = buildGetFeatureParams({
        version,
        layerId,
        outputFormat,
        maxFeatures: effectiveMaxFeatures,
        srsName: sourceProjection,
        namespaceUri: layer?.namespaceUri
      });

      const requestUrl = createRequestUrl(baseUrl, params);

      console.log("Fetching WFS data from:", requestUrl);

      try {
        const response = await fetchWithCorsProxy(requestUrl, {
          method: "GET",
          headers: {
            Accept:
              outputFormat && /json|geojson/i.test(outputFormat)
                ? "application/json,application/geo+json,text/plain,*/*"
                : "application/xml,text/xml,*/*"
          }
        });

        const result = await processWfsResponse(response, outputFormat);

        return {
          ...result,
          sourceProjection,
          outputFormatUsed: outputFormat || "server-default",
          serviceVersionUsed: version,
          requestUrl
        };
      } catch (error) {
        lastError = error;
        console.warn(
          `GetFeature failed. Version=${version}, outputFormat=${
            outputFormat || "server-default"
          }`,
          error
        );
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to fetch WFS data with all attempted formats.");
}

async function processWfsResponse(
  response: Response,
  outputFormat?: string
): Promise<{
  data: GeoJSON.FeatureCollection;
  attributes: string[];
}> {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  const trimmed = text.trim();

  if (!response.ok) {
    throw new Error(
      `WFS request failed: ${response.status} ${response.statusText}\n${trimmed.slice(
        0,
        ERROR_BODY_PREVIEW_LENGTH
      )}`
    );
  }

  const shouldTryJson =
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    /json|geojson/i.test(contentType) ||
    /json|geojson/i.test(outputFormat || "");

  if (shouldTryJson) {
    try {
      const data = JSON.parse(text);

      if (!data.type || !Array.isArray(data.features)) {
        throw new Error("JSON response is not a GeoJSON FeatureCollection.");
      }

      return {
        data,
        attributes: extractGeoJsonAttributes(data)
      };
    } catch (jsonError) {
      if (trimmed.startsWith("<")) {
        return processGmlOrException(text);
      }

      throw jsonError;
    }
  }

  if (trimmed.startsWith("<")) {
    return processGmlOrException(text);
  }

  throw new Error(
    `Unsupported WFS response format. Content-Type: ${contentType}. First bytes: ${trimmed.slice(
      0,
      UNSUPPORTED_FORMAT_PREVIEW_LENGTH
    )}`
  );
}

function processGmlOrException(xmlText: string): {
  data: GeoJSON.FeatureCollection;
  attributes: string[];
} {
  const xmlDoc = parseXmlOrThrow(xmlText, "WFS GetFeature response");

  const exceptionMessage = getOgcExceptionMessage(xmlDoc);
  if (exceptionMessage) {
    throw new Error(`WFS service exception: ${exceptionMessage}`);
  }

  const data = gmlToGeoJson(xmlDoc);

  return {
    data,
    attributes: extractGeoJsonAttributes(data)
  };
}

function extractGeoJsonAttributes(data: GeoJSON.FeatureCollection): string[] {
  const attributes = new Set<string>();

  for (const feature of data.features || []) {
    for (const key of Object.keys(feature.properties || {})) {
      attributes.add(key);
    }
  }

  return Array.from(attributes).sort();
}

function gmlToGeoJson(xmlDoc: XMLDocument): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  const members = allByLocalName(xmlDoc, "member")
    .concat(allByLocalName(xmlDoc, "featureMember"))
    .concat(allByLocalName(xmlDoc, "featureMembers"));

  for (const member of members) {
    const candidateFeatures =
      member.localName === "featureMembers"
        ? Array.from(member.children)
        : Array.from(member.children).slice(0, 1);

    for (const featureNode of candidateFeatures) {
      const feature = parseGmlFeature(featureNode, features.length);
      if (feature) features.push(feature);
    }
  }

  // Fallback: some servers put feature elements directly under FeatureCollection.
  if (features.length === 0) {
    const collection =
      xmlDoc.documentElement.localName === "FeatureCollection"
        ? xmlDoc.documentElement
        : firstByLocalName(xmlDoc, "FeatureCollection");

    if (collection) {
      for (const child of Array.from(collection.children)) {
        if (
          ["boundedBy", "member", "featureMember", "featureMembers"].includes(
            child.localName
          )
        ) {
          continue;
        }

        const feature = parseGmlFeature(child, features.length);
        if (feature) features.push(feature);
      }
    }
  }

  return {
    type: "FeatureCollection",
    features
  };
}

function parseGmlFeature(
  featureNode: Element,
  index: number
): GeoJSON.Feature | null {
  const properties: Record<string, unknown> = {};
  let geometry: GeoJSON.Geometry | null = null;

  for (const child of Array.from(featureNode.children)) {
    if (child.localName === "boundedBy") continue;

    if (containsGeometry(child)) {
      geometry = parseGmlGeometry(child);
      continue;
    }

    const value = child.textContent?.trim();

    if (value) {
      properties[child.localName] = coerceValue(value);
    }
  }

  const id =
    attr(featureNode, "id") || attr(featureNode, "fid") || `feature-${index}`;

  if (!geometry && Object.keys(properties).length === 0) {
    return null;
  }

  return {
    type: "Feature",
    id,
    geometry,
    properties
  };
}

const GML_GEOMETRY_NAMES = [
  "Point",
  "MultiPoint",
  "LineString",
  "Curve",
  "MultiLineString",
  "MultiCurve",
  "Polygon",
  "Surface",
  "MultiPolygon",
  "MultiSurface"
];

function containsGeometry(el: Element): boolean {
  if (GML_GEOMETRY_NAMES.includes(el.localName)) return true;

  return allByLocalNames(el, GML_GEOMETRY_NAMES).length > 0;
}

function findGeometryElement(root: Element): Element | undefined {
  if (GML_GEOMETRY_NAMES.includes(root.localName)) return root;

  return allByLocalNames(root, GML_GEOMETRY_NAMES)[0];
}

function parseGmlGeometry(root: Element): GeoJSON.Geometry | null {
  const geometryEl = findGeometryElement(root);
  if (!geometryEl) return null;

  switch (geometryEl.localName) {
    case "Point": {
      const coords = readFirstCoordinateSequence(geometryEl);
      return coords.length > 0
        ? {
            type: "Point",
            coordinates: coords[0]
          }
        : null;
    }

    case "MultiPoint": {
      const points = allByLocalName(geometryEl, "Point")
        .map(readFirstCoordinateSequence)
        .filter((coords) => coords.length > 0)
        .map((coords) => coords[0]);

      return points.length > 0
        ? {
            type: "MultiPoint",
            coordinates: points
          }
        : null;
    }

    case "LineString":
    case "Curve": {
      const coords = readFirstCoordinateSequence(geometryEl);

      return coords.length > 0
        ? {
            type: "LineString",
            coordinates: coords
          }
        : null;
    }

    case "MultiLineString":
    case "MultiCurve": {
      const lines = allByLocalName(geometryEl, "LineString")
        .concat(allByLocalName(geometryEl, "Curve"))
        .map(readFirstCoordinateSequence)
        .filter((coords) => coords.length > 0);

      return lines.length > 0
        ? {
            type: "MultiLineString",
            coordinates: lines
          }
        : null;
    }

    case "Polygon":
    case "Surface": {
      const rings = readPolygonRings(geometryEl);

      return rings.length > 0
        ? {
            type: "Polygon",
            coordinates: rings
          }
        : null;
    }

    case "MultiPolygon":
    case "MultiSurface": {
      const polygons = allByLocalName(geometryEl, "Polygon")
        .concat(allByLocalName(geometryEl, "Surface"))
        .map(readPolygonRings)
        .filter((rings) => rings.length > 0);

      return polygons.length > 0
        ? {
            type: "MultiPolygon",
            coordinates: polygons
          }
        : null;
    }

    default:
      return null;
  }
}

function readFirstCoordinateSequence(root: Element): number[][] {
  const posList = firstByLocalName(root, "posList");

  if (posList?.textContent) {
    return numbersToCoordinateTuples(
      posList.textContent,
      getSrsDimension(posList) || getSrsDimension(root) || 2
    );
  }

  const positions = allByLocalName(root, "pos");

  if (positions.length > 0) {
    return positions.flatMap((pos) =>
      numbersToCoordinateTuples(
        pos.textContent || "",
        getSrsDimension(pos) || getSrsDimension(root) || 2
      )
    );
  }

  const coordinates = firstByLocalName(root, "coordinates");

  if (coordinates?.textContent) {
    return coordinates.textContent
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split(",").map(Number))
      .filter((pair) => pair.length >= 2 && pair.every(Number.isFinite));
  }

  return [];
}

function readPolygonRings(polygon: Element): number[][][] {
  const rings: number[][][] = [];

  const linearRings = allByLocalName(polygon, "LinearRing");

  for (const ringNode of linearRings) {
    const ring = readFirstCoordinateSequence(ringNode);

    if (ring.length > 0) {
      const first = ring[0];
      const last = ring[ring.length - 1];

      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([...first]);
      }

      rings.push(ring);
    }
  }

  // Some GML has posList directly inside Polygon/Surface without LinearRing.
  if (rings.length === 0) {
    const coords = readFirstCoordinateSequence(polygon);

    if (coords.length > 0) {
      const first = coords[0];
      const last = coords[coords.length - 1];

      if (first[0] !== last[0] || first[1] !== last[1]) {
        coords.push([...first]);
      }

      rings.push(coords);
    }
  }

  return rings;
}

function getSrsDimension(el: Element): number | undefined {
  const raw =
    el.getAttribute("srsDimension") ||
    el.getAttribute("dimension") ||
    undefined;

  if (!raw) return undefined;

  const value = Number(raw);
  return Number.isFinite(value) && value >= 2 ? value : undefined;
}

function numbersToCoordinateTuples(text: string, dimension = 2): number[][] {
  const nums = text.trim().split(/\s+/).map(Number);
  const coords: number[][] = [];

  for (let i = 0; i + dimension - 1 < nums.length; i += dimension) {
    const tuple = nums.slice(i, i + dimension);

    if (tuple.length >= 2 && tuple.every(Number.isFinite)) {
      coords.push(tuple);
    }
  }

  return coords;
}

function coerceValue(value: string): unknown {
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return value;
}

export async function fetchFeatureCount(
  baseUrl: string,
  layerId: string,
  layer?: LayerInfo
): Promise<number> {
  return tryAcrossVersions(
    getEffectiveVersions(baseUrl, layer),
    async (version) => {
      const params = buildGetFeatureParams({
        version,
        layerId,
        resultType: "hits",
        namespaceUri: layer?.namespaceUri
      });

      const requestUrl = createRequestUrl(baseUrl, params);

      console.log("Fetching WFS feature count from:", requestUrl);

      const response = await fetchWithCorsProxy(requestUrl, {
        method: "GET",
        headers: {
          Accept: "application/xml,text/xml,*/*"
        }
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(
          `Failed to fetch feature count: ${response.status} ${response.statusText}\n${text.slice(
            0,
            ERROR_BODY_PREVIEW_LENGTH
          )}`
        );
      }

      return extractFeatureCountFromXml(text);
    },
    "Feature count request"
  );
}

function extractFeatureCountFromXml(xmlText: string): number {
  const xmlDoc = parseXmlOrThrow(xmlText, "WFS hits response");

  const exceptionMessage = getOgcExceptionMessage(xmlDoc);
  if (exceptionMessage) {
    throw new Error(`WFS service exception: ${exceptionMessage}`);
  }

  const root = xmlDoc.documentElement;

  const raw =
    root.getAttribute("numberMatched") ||
    root.getAttribute("numberOfFeatures") ||
    root.getAttribute("numberReturned") ||
    attr(root, "numberMatched") ||
    attr(root, "numberOfFeatures") ||
    attr(root, "numberReturned");

  if (!raw || raw === "unknown") {
    return -1;
  }

  const count = Number(raw);
  return Number.isFinite(count) ? count : -1;
}

export async function fetchWfsDataForDownload(
  baseUrl: string,
  layerId: string,
  maxFeatures: number = DEFAULT_MAX_FEATURES,
  layer?: LayerInfo,
  useNativeProjection = false
): Promise<string> {
  const requestLayer =
    !useNativeProjection && layer?.projections?.includes("EPSG:4326")
      ? {
          ...layer,
          defaultProjection: "EPSG:4326"
        }
      : layer;

  const { data } = await fetchWfsData(
    baseUrl,
    layerId,
    maxFeatures,
    requestLayer
  );

  return JSON.stringify(data, null, 2);
}

export async function fetchCapabilities(baseUrl: string): Promise<LayerInfo[]> {
  return fetchWfsCapabilities(baseUrl);
}
