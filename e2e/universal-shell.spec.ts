import {test,expect} from "@playwright/test";

test("universal shell renders and navigates core areas",async({page})=>{
 await page.goto("/");
 await expect(page.getByText("T.PAY OS · UNIVERSAL")).toBeVisible();
 await expect(page.getByText("Connexion serveur")).toBeVisible();
 await page.getByText("Organisations",{exact:true}).first().click();
 await expect(page.getByText("Créer une organisation")).toBeVisible();
 await page.getByRole("link",{name:"Réseau social",exact:true}).click();
 await expect(page.getByText("Réseau social",{exact:true})).toBeVisible();
 await page.getByRole("link",{name:"Opportunités",exact:true}).click();
 await expect(page.getByText("Opportunités",{exact:true})).toBeVisible();
 await page.getByRole("link",{name:"Tontine communautaire",exact:true}).click();
 await expect(page.getByText("Tontine communautaire",{exact:true})).toBeVisible();
});
