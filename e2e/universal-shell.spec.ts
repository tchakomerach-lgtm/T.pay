import {test,expect} from "@playwright/test";

test("universal shell renders and navigates core areas",async({page})=>{
 await page.goto("/");
 await expect(page.getByText("T.PAY OS · UNIVERSAL")).toBeVisible();
 await expect(page.getByText("Connexion serveur")).toBeVisible();
 await page.getByText("Organisations",{exact:true}).first().click();
 await expect(page.getByText("Créer une organisation")).toBeVisible();
 await page.getByText("Réseau social",{exact:true}).click();
 await expect(page.getByRole("heading",{name:"Réseau social"})).toBeVisible();
 await page.getByText("Opportunités",{exact:true}).click();
 await expect(page.getByRole("heading",{name:"Opportunités"})).toBeVisible();
 await page.getByText("Tontine communautaire",{exact:true}).click();
 await expect(page.getByRole("heading",{name:"Tontine communautaire"})).toBeVisible();
});
