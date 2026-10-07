# Versionhallittu harness

Nykyinen ketju ja GitHub-asetukset: [PR delivery](../docs/pr-delivery.md).

## Säännöt ja sopimukset

- `config.json`: determinististen tarkistusten npm-komennot ja plannerin provider/model/adapter sekä kontekstirajat.
- `platform.json`: olemassa oleva teknologia, vaaditut hakemistot ja kielletyt riippuvuudet/importit. Älä lisää teknologiarajoja ilman projektin päätöstä.
- `prompts/planner.md`: speksin pilkkominen 1–8 tehtävään.
- `prompts/implementer.md`: yhden hyväksytyn tehtävän tiedostomuutokset.
- `prompts/delivery-reviewer.md`: toteutuneen diff-in katselmointi.
- `schemas/`: task-, plan-, plan-document-, config-, platform- ja vanhan review-contractin JSON-skeemat.
- `lib/delivery.mjs`: tehtävien riippuvuusjärjestys, polkurajat, Markdown-plan ja frontend-luokittelu.
- `adapters/claude-code.mjs`: työkaluitta ajettava Claude Code, rajattu JSON-vastaus, OAuth-token tai paikallisesti API-avain. Ei peri GitHub-tunnuksia.
- `adapters/anthropic.mjs`: aiempi suoran Messages API:n planner-adapteri; vaatii API-avaimen eikä hyväksy Claude Code OAuth-tokenia.

## Portit

`npm run check` validoi konfiguraation ja skeemat, tarkistaa arkkitehtuuri-/riippuvuussäännöt ja ajaa konfiguroidut build-, lint-, test- ja synth-komennot. Oxlint ja Oxfmt kuuluvat lint-porttiin. Puuttuva tai virheellinen konfiguraatio estää ajon; käyttämätön tarkistus vaatii eksplisiittisen null-arvon ja perustelun.

Implement-workflow ajaa tämän saman komennon, minkä jälkeen `tools/review-implementation.mjs` kutsuu Claudea ja sitoo arvion lähtö- ja toteutuscommitteihin. Epäonnistunut arvio tai findings-lista estää etenemisen. GitHub-julkaisu tarkistaa myös raporttien onnistumisen ja työpuun puhtauden.

Frontend-automaatti: kaikki diff-in polut apps/web/:ssä, kaikki portit hyväksytty, main ei ole muuttunut. Muutoin toteutus-PR jää ihmiselle. Käytä GitHub-runneria tämän demon luotetuille omille spekseille; koodin build/test ei ole vihamielisen koodin eristysympäristö.

## Sääntöjen kehittäminen

Tee säännöistä, skeemoista ja prompteista tavallisia versionhallittuja muutoksia. Lisää merkityksellinen testi, kun muutat portin käyttäytymistä. Laajenna allowedFile-rajausta tietoisesti: toteutusagentti ei tässä versiossa saa muuttaa omaa harnessiaan, workflow'ita tai riippuvuuksia. Plans-hakemisto jätetään Oxfmtin ulkopuolelle, koska luettavan esityksen täytyy vastata determinististä JSON-renderöintiä.

Vanhat `ai:dry-run`, `harness:review`, `production-ready` ja `deploy-production` säilyvät aiemman assignment-contractin testeihin. Ne eivät ole uuden workflow-ketjun toteutusvaiheita. `config.review` koskee tätä vanhaa contractia; uusi diff-review käyttää Claude Codea ja plannerin mallivalintaa. Production-deploy pysyy estettynä. Deploy to AWS julkaisee erillisen AWS-demon OIDC:llä tarkistusten jälkeen; katso docs/aws-demo.md.
