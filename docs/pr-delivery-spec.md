# PR-pohjainen AI-kehitysketju

Toteuta main-haaraan saapuvan speksin suunnittelu omassa plan-haarassa ja PR:ssä.
Plan sisältää koneen JSON-contractin ja siitä johdetun suomenkielisen Markdown-kuvauksen.
Plan-PR:n merge käynnistää hyväksytyn planin tehtävät riippuvuusjärjestyksessä.
Toteutus tallennetaan implement-haaraan ja PR:ään determinististen tarkistusten ja AI-review'n jälkeen.
Kaikki apps/web/-hakemistoon rajautuvat muutokset voidaan yhdistää automaattisesti tarkistusten läpäistyä.
Muut muutokset odottavat ihmisen mergeä. Mainin rinnakkainen muutos estää automergen.
Deploy-workflow tekee vain CDK synthin: ei AWS-tunnuksia tai resurssien muutoksia.

## Omistus ja hyväksymiskriteerit

Omistus: .github/workflows, tools, harness, tests ja dokumentaatio.

- Free/private: ei environments- tai required reviewers -riippuvuutta.
- Ei maksettuja mallikutsuja testeissä; Claude Code -token lisätään erikseen.
- Polkurajaus, riippuvuudet, agentin JSON-vastaus ja provenance validoidaan.
- Ei agentin shell-oikeuksia; harness soveltaa rajatut tiedostosisällöt.
- CI ja synth toimivat ilman AWS-tunnuksia.

## CI-triggerien täsmennys

CI:n omistus: .github/workflows/ci.yml, plan.yml, tools/github-delivery.mjs ja ketjutestit.
Botin PR:t eivät saa synnyttää hyväksyntää odottavia pull_request-CI-ajoja.
Ihmisen saman repon haarapush ja botin eksplisiittinen dispatch tarkistavat tarkan commitin.
Plan- ja toteutus-PR:n CI-dispatch testataan mallikutsuitta. Workflow'iden määrä pysyy neljässä.
