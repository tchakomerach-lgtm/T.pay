import test from "node:test";
import assert from "node:assert/strict";
import {navigation,renderScreen} from "../apps/web/src/main.js";

test("web alpha exposes the five core navigation areas",()=>{
  assert.deepEqual(navigation.map((item)=>item.id),["home","organizations","social","opportunities","tontine"]);
});

test("home screen renders the T.Pay shell and sandbox warning",()=>{
  const html=renderScreen("home",false);
  assert.match(html,/T\.pay/);
  assert.match(html,/Aucune opération financière réelle/);
  assert.match(html,/Gestion des organisations/);
});

test("community tontine remains distinct from microfinance",()=>{
  const html=renderScreen("tontine",false);
  assert.match(html,/Tontine communautaire/);
  assert.match(html,/indépendant de la tontine journalière/);
});
