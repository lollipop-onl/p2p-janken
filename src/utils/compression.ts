import * as pako from "pako";
import { ConnectionData } from "../types";

export const compressConnectionData = (data: ConnectionData): string => {
  const jsonString = JSON.stringify(data);
  const compressed = pako.deflate(jsonString);
  return btoa(String.fromCharCode(...compressed));
};

export const decompressConnectionData = (
  compressedData: string
): ConnectionData => {
  const base64Compressed = decodeURIComponent(compressedData);
  const compressed = Uint8Array.from(atob(base64Compressed), (c) =>
    c.charCodeAt(0)
  );
  const jsonString = pako.inflate(compressed, { to: "string" });
  return JSON.parse(jsonString);
};

export const generateOfferUrl = (connectionData: ConnectionData): string => {
  const baseUrl = window.location.origin + window.location.pathname;
  const encodedOffer = encodeURIComponent(
    compressConnectionData(connectionData)
  );
  return `${baseUrl}?offer=${encodedOffer}`;
};

export const generateAnswerUrl = (connectionData: ConnectionData): string => {
  const baseUrl = window.location.origin + window.location.pathname;
  const encodedAnswer = encodeURIComponent(
    compressConnectionData(connectionData)
  );
  return `${baseUrl}?answer=${encodedAnswer}`;
};
