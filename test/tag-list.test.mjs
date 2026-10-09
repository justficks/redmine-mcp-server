import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const requests = [];
const redmine = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    requests.push({ method: req.method, url: req.url, body: JSON.parse(body) });
    if (req.method === "POST") {
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ issue: { id: 1 } }));
      return;
    }
    res.writeHead(204).end();
  });
});
const client = new Client({ name: "test", version: "0.0.0" });

before(async () => {
  await new Promise((resolve) => redmine.listen(0, "127.0.0.1", resolve));
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["dist/server.mjs"],
      env: {
        ...process.env,
        REDMINE_URL: `http://127.0.0.1:${redmine.address().port}`,
        REDMINE_API_KEY: "test",
      },
    })
  );
});

after(async () => {
  await client.close();
  redmine.close();
});

test("updateIssue sends tag_list to Redmine", async () => {
  await client.callTool({
    name: "updateIssue",
    arguments: {
      pathParams: { format: "json", issueId: 1 },
      bodyParams: { issue: { tag_list: ["a", "b"] } },
    },
  });

  const request = requests.at(-1);
  assert.equal(request.method, "PUT");
  assert.deepEqual(request.body.issue.tag_list, ["a", "b"]);
});

test("createIssue sends tag_list to Redmine", async () => {
  await client.callTool({
    name: "createIssue",
    arguments: {
      pathParams: { format: "json" },
      bodyParams: { issue: { project_id: 1, subject: "s", tag_list: ["a"] } },
    },
  });

  const request = requests.at(-1);
  assert.equal(request.method, "POST");
  assert.deepEqual(request.body.issue.tag_list, ["a"]);
});

test("tag_list description warns that the list is replaced", async () => {
  const { tools } = await client.listTools();

  for (const name of ["createIssue", "updateIssue"]) {
    const tool = tools.find((t) => t.name === name);
    const tagList = tool.inputSchema.properties.bodyParams.properties.issue.properties.tag_list;
    assert.match(tagList?.description ?? "", /replaces the whole list/i);
    assert.match(tagList?.description ?? "", /journal/i);
  }
});
