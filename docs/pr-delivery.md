# PR-pohjainen kehitysketju

## Neljä workflow'ta

1. **Plan**: main-push valitsee muuttuneet numeroidut `specs/NNNN-nimi.md`-tiedostot. Claude Code tuottaa tehtävät. Harness validoi JSONin ja luo siitä suomenkielisen Markdown-kuvauksen. Molemmat tallennetaan `plans/NNNN-<lähtöcommit>.json/.md`-tiedostoihin. PR: `plan/NNNN-<lähtöcommit>` → `main`.
2. **Implement**: plan-PR:n merge aloittaa toteutuksen haarassa `implement/<plan-PR-numero>`. JSON ja Markdown tarkistetaan vastaaviksi. Lähtökoodin on oltava sama kuin suunnittelussa (muiden planien lisääminen sallitaan). Tehtävät ajetaan riippuvuusjärjestyksessä. Jokaisella on allowedPaths, omistaja ja hyväksymiskriteerit. Agentti palauttaa tiedostosisällöt; harness validoi polut, muotoilee ja commitoi ne. Build/lint/test/synth ja erillinen Claude-katselmointi edeltävät PR:n avausta.
3. **CI**: yleiset deterministiset tarkistukset saman repon kaikkien haarojen pushien yhteydessä. Botin avaaman plan- tai toteutus-PR:n jälkeen automaatio kutsuu samaa CI-workflow’ta workflow_dispatch-tapahtumalla. Implement ajaa samat tarkistukset itse eikä odota tätä erillistä CI-ajoa.
4. **Deploy preview**: ihmisen tekemä implement-PR:n merge tai automergen ohjelmallinen dispatch käynnistää tämän. Syötteen on vastattava yhdistettyä implement-PR:ää ja mainin historiaan kuuluvaa committia. `npm run check` rakentaa ja tarkistaa sovelluksen sekä ajaa CDK synthin. CloudFormation-malli tallennetaan artefaktiksi. **AWS:iin ei deployata eikä AWS-tunnuksia tarvita.**

Plan-PR:n voi lukea GitHubin Files changed -näkymässä. Markdown on JSONin deterministinen esitys: katselmoija ja toteuttaja näkevät samat tehtävät. Raportit ja tarkistustulokset jäävät Actions-artefakteiksi (7 päivää) ja PR:ssä on linkki ajoon.

## Frontend-automaatti

Kaikkien todellisten muutospolkujen täytyy alkaa `apps/web/`. Myös poistot ja siirron molemmat puolet huomioidaan. Tyhjä muutos ei kelpaa. Determinististen tarkistusten ja AI-review'n on onnistuttava samalle toteutuscommitille. Toteutus-PR avataan aina.

Jos main on yhä toteutuksen lähtöcommitissa, automaatio tekee vain fast-forward-pushin mainiin. GitHub tunnistaa PR:n commitit yhdistetyiksi. Rinnakkainen main-muutos estää pushin; muutoksia ei ylikirjoiteta. Automaatio käynnistää deploy-preview'n erikseen, koska GITHUB_TOKEN-push ei käynnistä tavallista push-workflow'ta. GitHubin maksullista Auto-merge-ominaisuutta ei käytetä.

Jos muutos koskee muitakin hakemistoja tai main on edennyt, PR jää ihmisen yhdistettäväksi. Virhe pysäyttää ajon. Uusi speksiversio tuottaa uuden plan-PR:n; vanha plan ei kelpaa, jos speksi tai lähtökoodi muuttui. Vanhojen PR:ien sulkeminen jää käyttäjälle. Samasta planista ei luoda useita toteutus-PR:iä. Epäonnistunut API-toiminto saattaa jättää haaran/PR:n: tarkasta se ennen uusinta-ajoa. Jos automerge onnistui mutta dispatch epäonnistui, käynnistä Deploy preview käsin antamalla yhdistetty commit ja toteutus-PR:n numero.

## GitHub-asetukset

- Repo voi olla private ja tili Free. Environmentteja tai haarasuojauksia ei edellytetä.
- Settings → Actions → General → Workflow permissions: salli **Allow GitHub Actions to create and approve pull requests**. Workflow-kohtaiset contents/pull-requests/actions-oikeudet on määritelty YAMLissa.
- Lisää myöhemmin repository secretiin `CLAUDE_CODE_OAUTH_TOKEN`. Token luodaan Claude Coden `claude setup-token` -komennolla. Älä laita tokenia tiedostoihin, PR:ään tai chattiin.
- Workflows asentavat lukitun Claude Code CLI -version 2.1.277. Planner, toteuttaja ja katselmoija käyttävät samaa CLI-adapteria ja `sonnet`-mallialiasia. Alias voidaan korvata täsmällisellä mallilla harness/config.jsonissa.
- Aiempi Anthropic API -adapteri on säilytetty vaihtoehtona plannerille. OAuth-token ei ole ANTHROPIC_API_KEY. Nykyiset workflow't välittävät vain OAuth-tokenin.
- CI ei kuuntele pull_request-tapahtumaa, joten botin PR ei synnytä hyväksyntää odottavaa CI-ajoa. Ihmisen haarapush tarkistetaan ilman PR:ääkin. Pelkkä PR:n avaaminen/uudelleenavaaminen tai kohdehaaran vaihtaminen ei aja CI:tä uudelleen, eikä ulkoisen forkin push kuulu tämän repon CI:hin. Tämä malli on tarkoitettu nykyiselle saman repon kehitykselle.

## Rajat ja kehittäminen

Tämä on pieniä muutoksia varten rajattu ensimmäinen toteutus. Agentti saa enintään 250 KB kontekstin, kolme mallivuoroa ja kolmen minuutin aikarajan kutsua kohti. Enintään kahdeksan tehtävää ajetaan sarjassa. CLI toimii ilman työkaluja tai MCP:tä erillisessä tilapäishakemistossa; se saa vain harnessin välittämän tekstikontekstin. Automaattisia korjaussilmukoita ei ole.

Toteuttaja voi muuttaa vain apps/, infra/, tests/ ja docs/-tiedostoja planin allowedPaths-rajojen sisällä. Harnessin, workflow'iden, speksien, planien ja riippuvuuksien muuttaminen tehdään tässä versiossa käsin. Tämä estää myös agenttia muuttamasta omia porttejaan. Agentin tuottamaa sovelluskoodia suoritetaan build/test-vaiheessa tavallisella GitHub-runnerilla: tämä ei ole vihamielisen koodin hiekkalaatikko.

AI-review ei takaa virheettömyyttä. Free/private-tilillä repo-omistaja voi ohittaa työnkulun suoralla pushilla; hyväksyntämalli on harnessin toteuttama käytäntö, ei GitHubin pakottama haarasuojaus.

Historialliset ai:dry-run- ja harness:review-komennot säilyvät aiemman vastaanottodemon testaamiseen. Uusi implement-workflow käyttää omaa oikean koodidiffin katselmointia. Production-deploy on edelleen pois käytöstä.

## Ensimmäinen demo

Kun workflow't on commitoitu mainiin ja token lisätty, tee uusi numeroitu speksi, esimerkiksi `specs/0003-heading.md`, joka pyytää vain yhden nykyisen sivutekstin muuttamista. Pyydä rajaamaan tehtävän allowedPaths arvoon apps/web. Pushaa, katselmoi plan-PR ja mergeä. Seuraa Implement-ajoa, toteutus-PR:n automergeä ja Deploy preview -ajon synth-artefaktia. Sovellusta ei vielä julkaista AWS:iin.

Lähteet: [Claude Code CLI](https://code.claude.com/docs/en/cli-reference), [GitHub-triggerit](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

OAuth-tunnistautuminen ei toimi Claude Coden --bare-tilassa. Adapteri käyttää siksi tavallista print-tilaa erillisellä tilapäisellä HOME- ja CLAUDE_CONFIG_DIR-hakemistolla, tyhjillä setting-sources-asetuksilla sekä estetyillä hookeilla ja työkaluilla. Virheistä raportoidaan vain turvallinen luokka tai HTTP-status, ei raakaa mallivastausta tai tokenia.

## CI-ajon tarkka versio

Botin PR:n luoja lähettää CI:lle lähdehaaran ja sen commit-SHA:n. CI varmistaa, että dispatchin GitHub SHA vastaa annettua committia, ja checkout käyttää tätä muuttumatonta SHA:ta. Jos haara ehti liikkua, ajo pysähtyy eikä esitä uudempaa koodia aiemmin tarkistettuna. CI:n check liittyy lähdehaaran committiin, ei mainiin. CI tarkistaa haaran version; se ei muodosta PR:n virtuaalista merge-committia.

Käsin uusinta: Actions → CI → Run workflow, valitse PR:n lähdehaara ja anna sen nykyinen täysi commit-SHA. Tämä ei kutsu Claudea. Dispatch-virhe pysäyttää PR:n julkaisuvaiheen ennen automergeä; jo avattu PR säilyy. Implementin oma check + AI-review on edelleen automergen portti; erillinen CI on rinnakkainen tarkistus.
