# PR-pohjainen AI-kehitysketju

Toteuta main-haaraan saapuvan speksin suunnittelu omassa plan-haarassa ja PR:ssä.
Plan sisältää koneen JSON-contractin ja siitä johdetun suomenkielisen Markdown-kuvauksen.
Plan-PR:n merge käynnistää hyväksytyn planin tehtävät riippuvuusjärjestyksessä.
Toteutus tallennetaan implement-haaraan ja PR:ään determinististen tarkistusten ja AI-review'n jälkeen.
Kaikki apps/web/-hakemistoon rajautuvat muutokset voidaan yhdistää automaattisesti tarkistusten läpäistyä.
Muut muutokset odottavat ihmisen mergeä. Mainin rinnakkainen muutos estää automergen.
Alkuperäinen synth-only-vaihe on korvattu AWS-demodeploylla. Nykyinen käyttöönotto- ja poistovaatimus on docs/aws-demo.md:ssä.

## Omistus ja hyväksymiskriteerit

Omistus: .github/workflows, tools, harness, tests ja dokumentaatio.

- Free/private: ei environments- tai required reviewers -riippuvuutta.
- Ei maksettuja mallikutsuja testeissä; Claude Code -token lisätään erikseen.
- Polkurajaus, riippuvuudet, agentin JSON-vastaus ja provenance validoidaan.
- Ei agentin shell-oikeuksia; harness soveltaa rajatut tiedostosisällöt.
- CI ja synth toimivat ilman AWS-tunnuksia.

## CI-triggerien täsmennys

CI säilyy repossa vain workflow_dispatch-käynnistyksellä. Käyttäjä valitsee haaran ja antaa sen täyden commit-SHA:n; workflow varmistaa vastaavuuden ennen checkoutia.
Plan ja Implement eivät dispatchaa CI:tä. Ketjutestit varmistavat tämän sekä Deploy to AWS -dispatchin säilymisen automergessä. Implementin omat portit säilyvät pakollisina. Workflow'iden määrä pysyy neljässä.
