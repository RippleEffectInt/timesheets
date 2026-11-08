import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPair,
  SignJWT,
} from "../api/node_modules/jose/dist/webapi/index.js";
import { authenticate } from "../api/auth.js";
import { TENANT, CLIENT, SPA } from "../api/config.js";
import {
  mapStaff,
  resolvePrincipal,
  mapProjects,
  createSharePointRepository,
  decodeItem,
  monthValue,
} from "../api/sharepoint-repository.js";
import { createLiveHandler } from "../api/live-handler.js";
import { createGraph } from "../api/graph.js";
import { newRecord } from "../src/domain.js";
const oid = "11111111-1111-4111-8111-111111111111";
const fields = {
  Title: "example@example.invalid",
  StaffMember: "Example Person",
  field_3: "Yes",
  field_4: "Yes",
  field_5: "Yes",
  field_8: "Staff",
  field_9: "staff-example",
  field_10: oid,
  field_11: TENANT,
};
const person = mapStaff({ fields });
test("JWT verifies signature, issuer, audience, tenant, client and delegated scope; rejects forged and expired tokens", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const base = {
    oid,
    tid: TENANT,
    scp: "access_as_user",
    azp: SPA,
    ver: "2.0",
  };
  async function request(overrides = {}, key = privateKey) {
    const token = await new SignJWT({ ...base, ...overrides })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(`https://login.microsoftonline.com/${TENANT}/v2.0`)
      .setAudience(CLIENT)
      .setIssuedAt()
      .setNotBefore("0s")
      .setExpirationTime("2m")
      .sign(key);
    return new Request("https://example.invalid/api/bootstrap", {
      headers: { "X-Timesheets-Authorization": `Bearer ${token}` },
    });
  }
  assert.deepEqual(await authenticate(await request(), publicKey), {
    oid,
    tid: TENANT,
  });
  for (const overrides of [
    { tid: oid },
    { azp: oid },
    { scp: "other" },
    { oid: "not-a-guid" },
    { ver: "1.0" },
  ])
    await assert.rejects(
      () => request(overrides).then((r) => authenticate(r, publicKey)),
      { status: 401 },
    );
  const other = await generateKeyPair("RS256");
  await assert.rejects(
    () => request({}, other.privateKey).then((r) => authenticate(r, publicKey)),
    { status: 401 },
  );
  for (const [aud, iss, exp] of [
    ["wrong", `https://login.microsoftonline.com/${TENANT}/v2.0`, "2m"],
    [CLIENT, "https://attacker.invalid", "2m"],
    [CLIENT, `https://login.microsoftonline.com/${TENANT}/v2.0`, "-2m"],
  ]) {
    const t = await new SignJWT(base)
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(iss)
      .setAudience(aud)
      .setIssuedAt()
      .setNotBefore("-5m")
      .setExpirationTime(exp)
      .sign(privateKey);
    await assert.rejects(
      () =>
        authenticate(
          new Request("https://example.invalid", {
            headers: { "X-Timesheets-Authorization": `Bearer ${t}` },
          }),
          publicKey,
        ),
      { status: 401 },
    );
  }
  await assert.rejects(
    () => authenticate(new Request("https://example.invalid"), publicKey),
    { status: 401 },
  );
});
test("choice No is false; identity, active dates and role policies fail closed", () => {
  assert.equal(mapStaff({ fields: { ...fields, field_3: "No" } }).yeeld, false);
  assert.deepEqual(
    resolvePrincipal({ oid, tid: TENANT }, [person]).permissions,
    [],
  );
  assert.deepEqual(
    resolvePrincipal({ oid, tid: TENANT }, [{ ...person, access: "Manager" }])
      .permissions,
    ["report:read"],
  );
  assert.equal(
    resolvePrincipal({ oid, tid: TENANT }, [
      { ...person, access: "Administrator" },
    ]).permissions.length,
    2,
  );
  for (const rows of [
    [{ ...person, active: false }],
    [{ ...person, oid: "other" }],
    [person, person],
    [{ ...person, access: "Owner" }],
    [{ ...person, start: "2100-01-01" }],
  ])
    assert.throws(() => resolvePrincipal({ oid, tid: TENANT }, rows));
});
test("API rejects unauthenticated before Graph and denies reporting/writes to staff", async () => {
  let calls = 0;
  const graph = {
    all: async () => {
      calls++;
      return [{ fields }];
    },
  };
  const denied = createLiveHandler({ graph });
  assert.equal(
    (await denied(new Request("https://example.invalid/api/bootstrap"))).status,
    401,
  );
  assert.equal(calls, 0);
  const handler = createLiveHandler({
    graph,
    verify: async () => ({ oid, tid: TENANT }),
    env: {},
  });
  assert.equal(
    (await handler(new Request("https://example.invalid/api/reports"))).status,
    403,
  );
  assert.equal(
    (
      await handler(
        new Request("https://example.invalid/api/my-timesheet", {
          method: "PUT",
          body: "{}",
        }),
      )
    ).status,
    403,
  );
  const writeHandler = createLiveHandler({
    graph,
    verify: async () => ({ oid, tid: TENANT }),
    env: { TIMESHEETS_WRITE_ENABLED: "true" },
  });
  for (const body of ["{}", "null", "[]", "{"])
    assert.equal(
      (
        await writeHandler(
          new Request("https://example.invalid/api/my-timesheet", {
            method: "PUT",
            body,
          }),
        )
      ).status,
      400,
    );
});
test("SharePoint preserves zero, blank and per-project notes and uses ETag conditional updates", async () => {
  const record = newRecord(person, 2026, 11);
  record.entries[0].hours["2026-11-01"] = 0;
  record.entries[0].notes = "project note";
  record.yeeldNotes = "monthly";
  let item = null,
    write;
  const graph = {
    all: async () => (item ? [item] : []),
    url: (_list, suffix) => suffix,
    request: async (url, options) => {
      write = { url, ...options };
    },
  };
  const repo = createSharePointRepository(
    graph,
    [person],
    { field_2: { number: {} }, StaffMember: { text: {} } },
    { writeEnabled: true },
  );
  const saved = await repo.put(record, 0);
  assert.equal(saved.revision, 1);
  const f = JSON.parse(write.body).fields;
  item = { id: "1", eTag: '"etag1"', fields: f };
  assert.deepEqual(decodeItem(item), saved);
  assert.equal(saved.entries[0].hours["2026-11-02"], null);
  await repo.put({ ...saved, yeeldNotes: "revised" }, 1);
  assert.equal(write.headers["If-Match"], '"etag1"');
  await assert.rejects(() => repo.put(saved, 0), { status: 409 });
  await assert.rejects(
    () => createSharePointRepository(graph, [person], {}).put(saved, 1),
    { status: 403 },
  );
  assert.equal(
    monthValue(11, { choice: { choices: ["November"] } }),
    "November",
  );
});
test("Graph pagination stays on allowed list URLs; secrets are absent from errors; 412 is conflict", async () => {
  const env = {
    TIMESHEETS_TENANT_ID: TENANT,
    TIMESHEETS_CLIENT_ID: CLIENT,
    TIMESHEETS_CLIENT_SECRET: "synthetic-secret",
  };
  let count = 0;
  const graph = createGraph({
    env,
    fetcher: async (url) => {
      count++;
      if (url.includes("/token"))
        return Response.json({ access_token: "synthetic", expires_in: 3600 });
      return Response.json({
        value: [],
        "@odata.nextLink": "https://attacker.invalid/steal",
      });
    },
  });
  await assert.rejects(() => graph.all("staff"), { status: 502 });
  assert.equal(count, 2);
  const failed = createGraph({
    env,
    fetcher: async () => new Response("synthetic-secret", { status: 401 }),
  });
  await assert.rejects(
    () => failed.all("staff"),
    (e) => e.status === 503 && !e.message.includes("synthetic-secret"),
  );
  const conflict = createGraph({
    env,
    fetcher: async (url) =>
      url.includes("/token")
        ? Response.json({ access_token: "synthetic", expires_in: 3600 })
        : new Response("", { status: 412 }),
  });
  await assert.rejects(() => conflict.all("timesheets"), { status: 409 });
});
test("project identities are unique and YEELD remains separate", () => {
  const a = {
    fields: {
      Title: "YEELD",
      field_1: "YEELD-CODE",
      field_2: "Yes",
      field_3: "YEELD",
    },
  };
  assert.equal(mapProjects([a])[0].id, "project-yeeld");
  assert.throws(() => mapProjects([a, a]));
});

test("bootstrap returns only own profile; schema is verified; forged writes never reach storage", async () => {
  const required = {
    staff: [
      "Title",
      "StaffMember",
      "field_3",
      "field_4",
      "field_5",
      "field_8",
      "field_9",
      "field_10",
      "field_11",
    ],
    projects: ["Title", "field_1", "field_2", "field_3"],
    timesheets: [
      "Title",
      "StaffMember",
      "field_2",
      "Reporting_x0020_Year",
      "field_4",
      "field_5",
      "field_6",
      "field_7",
      "field_8",
      "Submittedat",
      "Lastsavedat",
      "field_11",
    ],
  };
  let writes = 0,
    reads = 0;
  const graph = {
    all: async (list, suffix) => {
      if (suffix === "columns")
        return required[list].map((name) => ({
          name,
          text: {},
          ...(list === "timesheets"
            ? ({
                field_4: { enforceUniqueValues: true, indexed: true },
                field_6: { text: { allowMultipleLines: true } },
                Reporting_x0020_Year: { number: {} },
                field_2: { number: {} },
              }[name] ?? {})
            : {}),
        }));
      if (list === "staff")
        return [
          { fields },
          {
            fields: {
              ...fields,
              field_9: "other",
              field_10: "22222222-2222-4222-8222-222222222222",
            },
          },
        ];
      if (list === "projects")
        return [
          {
            fields: {
              Title: "YEELD",
              field_1: "YEELD",
              field_2: "Yes",
              field_3: "YEELD",
            },
          },
        ];
      reads++;
      return [];
    },
    request: async () => {
      writes++;
    },
  };
  const handler = createLiveHandler({
    graph,
    verify: async () => ({ oid, tid: TENANT }),
    env: { TIMESHEETS_WRITE_ENABLED: "true" },
  });
  const bootstrap = await handler(
    new Request("https://example.invalid/api/bootstrap"),
  );
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.jsonBody.staff.length, 1);
  assert.equal(bootstrap.jsonBody.staff[0].id, person.id);
  assert(!("oid" in bootstrap.jsonBody.staff[0]));
  const read = await handler(
    new Request(
      "https://example.invalid/api/my-timesheet?year=2026&month=11&staffId=other",
    ),
  );
  assert.equal(read.status, 200);
  assert.equal(read.jsonBody.staffId, person.id);
  const forged = { ...newRecord(person, 2026, 11), staffId: "other" };
  const result = await handler(
    new Request("https://example.invalid/api/my-timesheet", {
      method: "PUT",
      body: JSON.stringify({ record: forged }),
    }),
  );
  assert.equal(result.status, 403);
  assert.equal(writes, 0);
  assert.equal(reads, 1);
});

test("v1 accepts both documented API audience forms and rejects other APIs", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  for (const audience of [CLIENT, `api://${CLIENT}`, "another-api"]) {
    const token = await new SignJWT({
      oid,
      tid: TENANT,
      scp: "access_as_user",
      appid: SPA,
      ver: "1.0",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(`https://sts.windows.net/${TENANT}/`)
      .setAudience(audience)
      .setIssuedAt()
      .setNotBefore("0s")
      .setExpirationTime("2m")
      .sign(privateKey);
    const request = new Request("https://example.invalid", {
      headers: { "X-Timesheets-Authorization": `Bearer ${token}` },
    });
    if (audience === "another-api")
      await assert.rejects(
        () => authenticate(request, publicKey),
        (e) =>
          e.status === 401 &&
          e.message.includes("AUTH_AUDIENCE") &&
          !e.message.includes(token),
      );
    else
      assert.deepEqual(await authenticate(request, publicKey), {
        oid,
        tid: TENANT,
      });
  }
});

test("remote Microsoft signing-key path verifies signatures and returns only safe failure categories", async () => {
  const { createSigningKeys } = await import("../api/signing-keys.js");
  const { exportJWK } = await import(
    "../api/node_modules/jose/dist/webapi/index.js"
  );
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "synthetic-key",
    use: "sig",
    alg: "RS256",
  };
  const token = await new SignJWT({
    oid,
    tid: TENANT,
    scp: "access_as_user",
    azp: SPA,
    ver: "2.0",
  })
    .setProtectedHeader({ alg: "RS256", kid: "synthetic-key" })
    .setIssuer(`https://login.microsoftonline.com/${TENANT}/v2.0`)
    .setAudience(CLIENT)
    .setIssuedAt()
    .setNotBefore("0s")
    .setExpirationTime("2m")
    .sign(privateKey);
  const req = () =>
    new Request("https://example.invalid", {
      headers: { "X-Timesheets-Authorization": `Bearer ${token}` },
    });
  let calls = 0;
  const resolver = createSigningKeys(async (url, options) => {
    calls++;
    assert.equal(
      url,
      `https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`,
    );
    assert.equal(new Headers(options.headers).get("authorization"), null);
    return Response.json({ keys: [jwk] });
  });
  assert.deepEqual(await authenticate(req(), resolver), { oid, tid: TENANT });
  await authenticate(req(), resolver);
  assert.equal(calls, 1);
  const failures = [
    [
      async () => new Response("private response", { status: 403 }),
      "AUTH_KEYS_FORBIDDEN",
    ],
    [
      async () => new Response("private response", { status: 500 }),
      "AUTH_KEYS_HTTP",
    ],
    [async () => new Response("private response"), "AUTH_KEYS_JSON"],
    [async () => Response.json({ keys: [] }), "AUTH_KEYS_FORMAT"],
    [
      async () => {
        throw Object.assign(new TypeError("private response"), {
          cause: { code: "ENOTFOUND" },
        });
      },
      "AUTH_KEYS_DNS",
    ],
    [
      async () => {
        throw Object.assign(new TypeError("private response"), {
          cause: { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" },
        });
      },
      "AUTH_KEYS_TLS",
    ],
    [
      async () => {
        throw new TypeError("private response");
      },
      "AUTH_KEYS_NETWORK",
    ],
  ];
  for (const [fetcher, code] of failures)
    await assert.rejects(
      () => authenticate(req(), createSigningKeys(fetcher)),
      (e) =>
        e.status === 401 &&
        e.message.includes(code) &&
        !e.message.includes("private response") &&
        !e.message.includes(token),
    );
  await assert.rejects(
    () =>
      authenticate(
        new Request("https://example.invalid", {
          headers: { "X-Timesheets-Authorization": "Bearer not-a-jwt" },
        }),
        resolver,
      ),
    (e) => e.message.includes("AUTH_TOKEN_FORMAT"),
  );
});

test('platform Authorization cannot authenticate; app header still requires a signed Microsoft token',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');
 const token=await new SignJWT({oid,tid:TENANT,scp:'access_as_user',azp:SPA,ver:'2.0'}).setProtectedHeader({alg:'RS256'}).setIssuer(`https://login.microsoftonline.com/${TENANT}/v2.0`).setAudience(CLIENT).setIssuedAt().setNotBefore('0s').setExpirationTime('2m').sign(privateKey);
 await assert.rejects(()=>authenticate(new Request('https://example.invalid',{headers:{Authorization:`Bearer ${token}`}}),publicKey),{status:401});
 assert.deepEqual(await authenticate(new Request('https://example.invalid',{headers:{Authorization:'Bearer platform-token','X-Timesheets-Authorization':`Bearer ${token}`}}),publicKey),{oid,tid:TENANT});
 await assert.rejects(()=>authenticate(new Request('https://example.invalid',{headers:{Authorization:`Bearer ${token}`,'X-Timesheets-Authorization':'Bearer forged'}}),publicKey),{status:401});
});

test('Manager is denied reopen by the API before any record access or write',async()=>{
 let calls=0;
 const graph={all:async(list)=>{calls++;assert.equal(list,'staff');return [{fields:{...fields,field_8:'Manager'}}];},request:async()=>assert.fail('No writes allowed')};
 const handler=createLiveHandler({graph,verify:async()=>({oid,tid:TENANT}),env:{TIMESHEETS_WRITE_ENABLED:'true'}});
 const result=await handler(new Request('https://example.invalid/api/reopen',{method:'POST',body:JSON.stringify({key:'other:2026-11',revision:1})}));
 assert.equal(result.status,403);assert.equal(calls,1);
});
