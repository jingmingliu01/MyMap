import assert from "node:assert/strict";
import test from "node:test";
import { getAgentConfig, getFetchPlacesConfig, getSelectionConfig, readIntEnv } from "./env";

test("readIntEnv returns defaults and validates integer bounds", () => {
  withEnv({ TEST_INT: undefined }, () => {
    assert.equal(readIntEnv("TEST_INT", 7), 7);
  });

  withEnv({ TEST_INT: "12" }, () => {
    assert.equal(readIntEnv("TEST_INT", 7, { min: 1, max: 20 }), 12);
  });

  withEnv({ TEST_INT: "12.5" }, () => {
    assert.throws(() => readIntEnv("TEST_INT", 7), /must be an integer/);
  });

  withEnv({ TEST_INT: "0" }, () => {
    assert.throws(() => readIntEnv("TEST_INT", 7, { min: 1 }), /must be >= 1/);
  });
});

test("runtime config readers use documented env keys", () => {
  withEnv(
    {
      AMAP_POI_PAGE_SIZE: "10",
      AMAP_POI_MAX_PAGES: "2",
      LLM_MAX_SELECTED_BRANCHES: "8",
      LLM_MAX_SELECTED_ATTRACTION_BRANCHES: "1",
      AI_MAX_TOOL_STEPS: "5",
      AI_CONTEXT_MESSAGES: "3",
      AI_MESSAGE_CHAR_LIMIT: "1200"
    },
    () => {
      assert.deepEqual(getFetchPlacesConfig(), {
        pageSize: 10,
        maxPages: 2,
        maxRequestAttempts: 3,
        requestTimeoutMs: 15_000,
        retryBackoffMs: 350
      });
      assert.deepEqual(getSelectionConfig(), {
        maxSelectedBranches: 8,
        maxSelectedAttractionBranches: 1
      });
      assert.deepEqual(getAgentConfig(), {
        maxToolSteps: 5,
        contextMessages: 3,
        messageCharLimit: 1200
      });
    }
  );
});

function withEnv(updates: Record<string, string | undefined>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(updates)) {
    previous.set(key, process.env[key]);
    const value = updates[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

