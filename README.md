# Porridge Pot

Pieni laboratorio AI-vetoisen ohjelmistokehityksen kokeilemiseen. Pohjasovellus
sisältää kirjautumisen ja Hello World -näkymän. Seuraavat ominaisuudet aloitetaan
kirjoittamalla speksi `specs/`-hakemistoon.

## Paikallinen käyttö

Tarvitset Node.js 22:n (vähintään 22.12) ja npm:n.

Projektin `.npmrc` käyttää julkista npm-rekisteriä (`https://registry.npmjs.org/`).
Se ohittaa käyttäjäkohtaisen oletusrekisterin tämän projektin hakemistossa;
globaalia Artifactory-asetusta ei muuteta.

```sh
npm ci
npm run dev
```

Avaa Viten tulostama osoite, tavallisesti http://127.0.0.1:5173.
Testitunnus: **dev**, salasana: **local-demo-only**. Tiedot ja istunnot ovat
paikallisen palvelimen muistissa ja katoavat käynnistyksessä. AWS-yhteyttä ei tarvita.
Paikallinen tunnus ei siirry AWS:ään.

```sh
npm run check
```

Komento tarkistaa linttauksen ja muotoilun, suorittaa testit, rakentaa käyttöliittymän ja Lambdan sekä muodostaa
CloudFormation-mallin. Se ei luo AWS-resursseja.

## Rakenne

| Polku             | Sisältö                                                       |
| ----------------- | ------------------------------------------------------------- |
| apps/web          | React ja Vite                                                 |
| apps/api          | Lambda-käsittelijä, kirjautuminen ja tietovarastot            |
| infra             | AWS CDK: S3, CloudFront, HTTP API, Lambda ja DynamoDB         |
| specs             | Vaatimukset ja ensimmäisen tehtävienjaon esimerkki            |
| tools             | Paikallinen palvelin, build, testikäyttäjä ja AI-putken runko |
| tests             | Kirjautumisen ja tehtäväsuunnitelman testit                   |
| .github/workflows | Plan, Implement, CI, Deploy to AWS ja Destroy demo            |
| ATTIC             | Aiemmat luonnokset, säilytetty sellaisinaan                   |

## AWS-käyttöönotto

Katso [AWS-demon käyttöönotto ja poisto](docs/aws-demo.md). Sovellus julkaistaan
jäsentilille `818028063586`, Tukholmaan. CloudFrontin WAF luodaan Virginiaan.
Ennen ensimmäistä ajoa bootstrapataan toinen alue, päivitetään GitHub-roolin policy
ja lisätään GitHub-secrets `ALLOWED_IPV4_CIDRS` sekä `DEMO_PASSWORD`.

Deploy to AWS julkaisee nyt oikeasti AWS:iin. Destroy demo poistaa stackit sekä
sovellusdatan; bootstrapit jäävät uudelleenkäyttöön. AWS-käyttö aiheuttaa kustannuksia.

## AI-putki

Katso [PR-pohjaisen kehitysketjun ohje](docs/pr-delivery.md).
CI säilyy käsin käynnistettävänä tarkistuksena (Actions → CI → Run workflow), mutta
se ei käynnisty pusheista eikä Plan- tai Implement-workflow’sta.

Speksin push mainiin → Plan-PR → ihmisen merge → toteutus ja tarkistukset →
toteutus-PR → ihmisen tai automaation merge → AWS-demodeploy.

Planner, toteuttaja ja katselmoija käyttävät Claude Codea. Repository secret
`CLAUDE_CODE_OAUTH_TOKEN` lisätään erikseen ennen ensimmäistä malliajoa.
Vain apps/web/- ja/tai docs/-hakemistoihin rajautuva muutos yhdistetään automaattisesti, jos tarkistukset ja AI-review
onnistuvat eikä main ole muuttunut. Hyväksytty merge käynnistää AWS-demodeployn.

`npm run check` ajaa harnessin deterministiset portit. Vanhan dry-run-rungon
komennot säilyvät testejä varten, mutta eivät ole uuden workflow-ketjun vaiheita.

## Linttaus ja muotoilu

```sh
npm run lint       # Oxlint + Oxfmt-tarkistus, ei muuta tiedostoja
npm run lint:fix   # Oxlintin automaattiset korjaukset
npm run fmt        # Muotoile tiedostot
npm run fmt:check  # Tarkista vain muotoilu
```

Oxlint käyttää `--init`-oletuskonfiguraation correctness-sääntöjä virheinä
sekä React-pluginia nykyistä käyttöliittymää varten. Varoituksetkin estävät tarkistuksen.
Oxfmt käyttää oletustyyliään: 2 välilyöntiä, kaksoislainausmerkit,
puolipisteet ja 100 merkin tavoiterivipituus. Importtien lajittelu ei ole käytössä.
Konfiguraatiot ovat `.oxlintrc.json` ja `.oxfmtrc.json`; työkalujen versiot on lukittu.
Historiallinen `ATTIC/`, riippuvuudet, paikalliset salaisuudet ja generoidut tiedostot
on rajattu tarkistuksista pois. npm ylläpitää package-lock.json-tiedoston muotoilun.
`npm run check` sisältää molemmat tarkistukset harnessin lint-portissa, joten
CI-, AI-SDLC- ja deploy-workflow't käyttävät samoja sääntöjä.

Lähteet: [Oxlint-konfiguraatio](https://oxc.rs/docs/guide/usage/linter/config),
[Oxfmt-oletukset](https://oxc.rs/docs/guide/usage/formatter/config).
