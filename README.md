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
| .github/workflows | Plan, Implement, CI ja CDK synth -julkaisuharjoitus           |
| ATTIC             | Aiemmat luonnokset, säilytetty sellaisinaan                   |

## AWS-käyttöönotto

Valitse oma kokeilutili ja kirjaudu AWS CLI:llä. Oletusalue on `eu-north-1`.
AWS-käyttö aiheuttaa kustannuksia. Seuraavat komennot tehdään erikseen, kun
haluat ottaa ympäristön käyttöön:

```sh
export AWS_PROFILE=oma-profiili
export AWS_REGION=eu-north-1
npx cdk bootstrap
npm run deploy
```

Osoite ja taulun nimi löytyvät tulosteesta sekä `cdk-outputs.json`-tiedostosta.
Luo erillinen testikäyttäjä. Syötä salasana piilotetusti, jotta se ei päädy
komentohistoriaan (alla zsh/macOS):

```sh
export USERS_TABLE='CDK-tulosteen-UsersTableName'
export SEED_USERNAME='jani'
read -rs 'SEED_PASSWORD?Testikäyttäjän salasana (vähintään 12 merkkiä): '
export SEED_PASSWORD
npm run seed
unset SEED_PASSWORD
```

GitHubin `deploy.yml` tekee toistaiseksi vain CDK synthin. Se ei tarvitse AWS-tunnuksia eikä luo resursseja. Yllä olevat paikalliset deploy-komennot ovat erillisiä, käsin tehtäviä toimintoja.

Resurssien poisto: `npx cdk destroy`. DynamoDB-taulu ja S3-säiliö säilytetään
tarkoituksella; poista ne erikseen, jos et tarvitse dataa ja haluat lopettaa kustannukset.
CDK-bootstrapin resurssit ovat myös erillisiä.

## AI-putki

Katso [PR-pohjaisen kehitysketjun ohje](docs/pr-delivery.md).
CI säilyy käsin käynnistettävänä tarkistuksena (Actions → CI → Run workflow), mutta
se ei käynnisty pusheista eikä Plan- tai Implement-workflow’sta.

Speksin push mainiin → Plan-PR → ihmisen merge → toteutus ja tarkistukset →
toteutus-PR → ihmisen tai automaation merge → CDK synth.

Planner, toteuttaja ja katselmoija käyttävät Claude Codea. Repository secret
`CLAUDE_CODE_OAUTH_TOKEN` lisätään erikseen ennen ensimmäistä malliajoa.
Vain apps/web/- ja/tai docs/-hakemistoihin rajautuva muutos yhdistetään automaattisesti, jos tarkistukset ja AI-review
onnistuvat eikä main ole muuttunut. AWS:iin ei vielä deployata.

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
