import {Context} from "hono";

export function getUser(c: Context | Headers) {
  const CFUserHeaderName = "Cf-Access-Authenticated-User-Email";
  if (c instanceof Headers) {
    return c.get(CFUserHeaderName) || 'UNKNOWN';
  } else if (c instanceof Context) {
    return c.req.header(CFUserHeaderName) || "UNKNOWN";
  }
}

export function getColo(cf: CfProperties<unknown>): string {
  return cf?.colo || "UNKNOWN";
}

