import { toCsv } from "./toCsv.js";

/**
 * Builds export files and R scaffolding for IRT calibration/equating.
 * Outputs:
 *  - persons.csv
 *  - items.csv
 *  - responses_long.csv (person-item long format)
 *  - mirt_template.R
 *  - tam_template.R
 *  - manifest.json
 */
export function buildIrtPackage({ sessionsState, itembank, formsMeta }){
  const sessions = sessionsState?.sessions ?? {};
  const itemsById = new Map((itembank?.items ?? []).map(it => [it.id, it]));

  const persons = [];
  const responses = [];
  const personIndex = new Map();

  function addPerson(personId, meta){
    if (personIndex.has(personId)) return;
    personIndex.set(personId, persons.length);
    persons.push({
      personId,
      sessionId: meta.sessionId ?? "",
      createdAt: meta.createdAt ?? "",
      mode: meta.mode ?? "",
      formId: meta.formId ?? "",
      ageYears: meta.ageYears ?? "",
      lang: meta.language ?? "",
      tz: meta.tz ?? "",
      deviceType: meta.deviceType ?? "",
      groupA: meta.groupA ?? "",
      groupB: meta.groupB ?? "",
      groupC: meta.groupC ?? ""
    });
  }

  for (const s of Object.values(sessions)){
    if (!s.completed) continue;
    const meta = s.meta ?? {};
    const personId = meta.participantId ?? s.id;

    addPerson(personId, { ...meta, sessionId: s.id, createdAt: s.createdAt });

    for (const e of (s.events ?? [])){
      if (e.type !== "ITEM_RESPONSE") continue;
      const p = e.payload ?? {};
      if (!p.itemId) continue;

      responses.push({
        personId,
        sessionId: s.id,
        formId: meta.formId ?? "",
        domain: p.domain ?? "",
        family: p.family ?? "",
        itemId: p.itemId ?? "",
        anchor: p.anchor ? 1 : 0,
        x: p.x ?? "",
        rtMs: p.rtMs ?? "",
        thetaAfter: p.thetaAfter ?? "",
        semAfter: p.semAfter ?? ""
      });
    }
  }

  // Build items table
  const items = [];
  const allForms = formsMeta?.forms ?? {};
  const formIds = Object.keys(allForms);
  const formMembership = {}; // itemId -> {A:1,B:1...}
  for (const fid of formIds){
    const f = allForms[fid];
    for (const [domain, v] of Object.entries(f)){
      for (const id of (v.items ?? [])){
        formMembership[id] = formMembership[id] ?? {};
        formMembership[id][fid] = 1;
      }
    }
  }

  for (const [id, it] of itemsById.entries()){
    const fm = formMembership[id] ?? {};
    const anchors = new Set();
    for (const fid of formIds){
      for (const [domain, v] of Object.entries(allForms[fid] ?? {})){
        for (const a of (v.anchors ?? [])) anchors.add(a);
      }
    }
    items.push({
      itemId: id,
      domain: it.domain ?? "",
      family: it.family ?? "",
      model: it.model ?? "2PL",
      a: it.a ?? "",
      b: it.b ?? "",
      c: it.c ?? "",
      anchor: anchors.has(id) ? 1 : 0,
      inFormA: fm["A"] ? 1 : 0,
      inFormB: fm["B"] ? 1 : 0,
      inFormC: fm["C"] ? 1 : 0
    });
  }

  // R templates
  const mirt = buildMirtTemplate();
  const tam = buildTamTemplate();

  const manifest = {
    schema: "chc-cat-irt-package-v1",
    createdAt: new Date().toISOString(),
    files: ["persons.csv","items.csv","responses_long.csv","mirt_template.R","tam_template.R"],
    notes: [
      "This package is scaffolding: you must clean, check, and analyze.",
      "For equating, use shared anchors and include formId as a group or use multipleGroup models.",
      "For DIF, use multipleGroup with invariance constraints, or logistic regression DIF, and confirm with IRT DIF."
    ]
  };

  return {
    files: [
      { name: "persons.csv", mime: "text/csv", content: toCsv(persons) },
      { name: "items.csv", mime: "text/csv", content: toCsv(items) },
      { name: "responses_long.csv", mime: "text/csv", content: toCsv(responses) },
      { name: "mirt_template.R", mime: "text/plain", content: mirt },
      { name: "tam_template.R", mime: "text/plain", content: tam },
      { name: "manifest.json", mime: "application/json", content: JSON.stringify(manifest, null, 2) }
    ]
  };
}

function buildMirtTemplate(){
  return `
# mirt_template.R
# Requirements:
#   install.packages(c("mirt","dplyr","tidyr","readr","stringr"))
library(mirt)
library(dplyr)
library(tidyr)
library(readr)

# Files exported from the app:
persons <- read_csv("persons.csv", show_col_types = FALSE)
items   <- read_csv("items.csv", show_col_types = FALSE)
respL   <- read_csv("responses_long.csv", show_col_types = FALSE)

# --- Basic cleaning ---
respL <- respL %>%
  filter(!is.na(x)) %>%
  mutate(x = as.integer(x))

# --- Wide response matrix per domain (example: Gf) ---
domain <- "Gf"
respD <- respL %>% filter(domain == !!domain)

respW <- respD %>%
  select(personId, itemId, x) %>%
  pivot_wider(names_from = itemId, values_from = x)

X <- as.data.frame(respW[ , -1])
rownames(X) <- respW$personId

# --- 2PL model (single factor within domain) ---
# NOTE: for real work, evaluate dimensionality and local dependence.
mod <- mirt(X, 1, itemtype = "2PL")

summary(mod)
coef(mod, IRTpars = TRUE, simplify = TRUE)

# --- Multi-group (equating across forms) ---
# Use formId as group indicator. Anchors can be constrained equal.
# Example: restrict anchor items to equal parameters across groups (invariance).
# Build grouping vector in same order as X rows:
grp <- persons %>% filter(personId %in% rownames(X)) %>%
  arrange(match(personId, rownames(X))) %>% pull(formId)

# Identify anchors from items.csv
anchor_ids <- items %>% filter(domain == !!domain, anchor == 1) %>% pull(itemId)
# Invariance constraints for anchors:
inv <- list(slopes = anchor_ids, intercepts = anchor_ids)

mg <- multipleGroup(X, 1, group = grp, itemtype = "2PL",
                    invariance = inv)

summary(mg)

# --- DIF screening (mirt) ---
# You can test DIF by comparing constrained vs free models per item.
# See: DIF(mg, which.par = c("a1","d"), scheme = "add")
# For production, prefer robust pipelines and pre-registration.
`;
}

function buildTamTemplate(){
  return `
# tam_template.R
# Requirements:
#   install.packages(c("TAM","dplyr","tidyr","readr"))
library(TAM)
library(dplyr)
library(tidyr)
library(readr)

persons <- read_csv("persons.csv", show_col_types = FALSE)
items   <- read_csv("items.csv", show_col_types = FALSE)
respL   <- read_csv("responses_long.csv", show_col_types = FALSE)

respL <- respL %>% filter(!is.na(x)) %>% mutate(x = as.integer(x))

domain <- "Gf"
respD <- respL %>% filter(domain == !!domain)

respW <- respD %>%
  select(personId, itemId, x) %>%
  pivot_wider(names_from = itemId, values_from = x)

X <- as.matrix(respW[ , -1])
rownames(X) <- respW$personId

# --- Rasch / 2PL-like ---
# TAM's core is Rasch-family; for 2PL you may use tam.mml.2pl (if available) or equivalent approaches.
# Start with Rasch:
rasch <- tam.mml(resp = X)

summary(rasch)

# --- Anchors / equating ---
# One approach: fit multi-group models or use fixed item parameters for anchors.
# This is scaffolding; consult TAM documentation for your equating design.
`;
}
