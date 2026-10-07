# AWS-demo: käyttöönotto ja poisto

Tämä on tuhoamisen kestävä **demo**, ei tuotantoympäristö. Sovellusdata poistetaan
Destroy demo -ajossa. Käyttöönotto käyttää erillistä jäsentiliä `818028063586`,
ei organisaation hallintatiliä. Koodi tarkistaa tilin ennen deployta ja poistoa.

## Kertaluonteiset AWS-asetukset

Kirjaudu CLI-profiililla `porridgepot` ja varmista, että tilinumero on oikea:

```sh
aws sso login --profile porridgepot
aws sts get-caller-identity --profile porridgepot
```

Tukholman bootstrap on jo tehty. CloudFrontin WAF tarvitsee lisäksi Virginian:

```sh
npx cdk bootstrap aws://818028063586/us-east-1 --profile porridgepot --termination-protection
```

Päivitä olemassa olevan `porridgepot-github-deploy`-roolin inline policy
`PorridgePotCdkDeploy` tiedoston `infra/setup/github-deploy-policy.json` sisällöksi:

```sh
aws iam put-role-policy --profile porridgepot \
  --role-name porridgepot-github-deploy \
  --policy-name PorridgePotCdkDeploy \
  --policy-document file://infra/setup/github-deploy-policy.json
```

Policy sallii CDK:n deploy-, file-publishing- ja lookup-roolien käytön molemmilla
alueilla. Bootstrapin CloudFormation-roolilla on tässä eristetyssä demotilissä
AdministratorAccess; tämä ei ole vähimmän oikeuden tuotantopolitiikka.

GitHub-OIDC-provider ja roolin trust policy säilyvät: audience
`sts.amazonaws.com`, subject **täsmälleen**
`repo:janigoto11/porridgepot:ref:refs/heads/main`.
Pitkäikäisiä AWS access key -tunnuksia ei tallenneta GitHubiin.
GitHub Environmentia tai maksullista hyväksyntäporttia ei tarvita tässä demossa.

## GitHub-asetukset

Settings → Secrets and variables → Actions → Repository secrets:

| Nimi                 | Arvo                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ALLOWED_IPV4_CIDRS` | Oma julkinen IPv4 `/32`-päätteellä, esimerkiksi `203.0.113.42/32`. Useat verkot pilkuilla. Esimerkkiosoite ei ole sinun osoitteesi. |
| `DEMO_PASSWORD`      | Demokäyttäjän salasana, 12–256 merkkiä.                                                                                             |

Valinnainen repository **variable** `DEMO_USERNAME` vaihtaa oletustunnuksen `demo`.
`CLAUDE_CODE_OAUTH_TOKEN` pysyy vain Plan/Implement-käytössä.
Tämä versio sallii vain IPv4-verkkoja. IPv6-yhteydet estetään; vaihtuva julkinen
IPv4 edellyttää secretin päivittämistä ja uutta deployta. Kaikille avoin `/0`
hylätään. IP-osoitteita ei laiteta koodiin eikä template-artefakteihin.
GitHub secrets ja CloudFormation NoEcho peittävät syötteitä, mutta AWS-resurssien
katseluoikeudet omaava ylläpitäjä voi nähdä IP-setin ja origin-otsakkeen.

## Julkaiseminen

Pushaa nämä muutokset mainiin. Ensimmäinen käyttöönotto: **Actions → Deploy to AWS
→ Run workflow → main**. Jätä molemmat syötteet tyhjiksi: ajo julkaisee senhetkisen
mainin. Tämä toimii myös Destroy demon jälkeen ilman uutta speksiä.

Normaalissa putkessa implement-PR:n merge käynnistää julkaisun. Ihmisen mergestä
syntyy ensin pieni dispatch-jobi ja sitten erillinen main-haaran deploy-ajo, jotta
OIDC-tunniste vastaa roolin trust policyä. Automaattinen merge tekee saman dispatchin
suoraan. Plan-PR:n merge ei deployaa.

1. Tarkistetaan yhdistetty PR ja commit. Vanhentunut automaattinen julkaisu estetään,
   jos main on edennyt; käytä silloin käsin käynnistystä tyhjillä syötteillä.
2. `npm run check`: build, lint, format-check, testit ja offline-CDK-synth.
3. Haetaan lyhytaikaiset AWS-tunnukset OIDC:llä.
4. Julkaistaan `PorridgePotEdge` alueelle `us-east-1` (WAF ja IP-setti).
5. Sen ARN annetaan parametrina `PorridgePot`-stackille alueella `eu-north-1`.
6. Luodaan/päivitetään demokäyttäjä ja julkaistaan frontend. Osoite näkyy ajon
   Summaryssa. Template-artefakti säilyy seitsemän päivää.

AWS ei ole mukana testiajoissa. Ensimmäinen oikea deploy on edelleen tarpeen
IAM-oikeuksien ja pilvipalvelujen yhteistoiminnan varmistamiseen. Jos sovelluksen
julkaisu epäonnistuu WAFin luonnin jälkeen, WAF voi jäädä laskutettavaksi:
korjaa ja aja uudestaan tai käytä Destroy demoa.

Paikallinen julkaisu on myös mahdollinen: kirjaudu profiililla, aseta
`AWS_PROFILE=porridgepot`, `ALLOWED_IPV4_CIDRS`, `DEMO_PASSWORD` sekä tarvittaessa
`DEMO_USERNAME` ympäristöön ja suorita `npm run deploy`. Syötä salasana
piilotetusti, älä komentohistoriaan. Paikallinen komento tekee samat tarkistukset.

## Suojaus ja sen rajat

CloudFrontin WAF estää ensin kaikki IP-sallitun listan ulkopuoliset pyynnöt.
Sallitut pyynnöt tarkastetaan lisäksi `AWSManagedRulesCommonRuleSet`-ryhmällä.
IP-sääntö ei ole aikainen Allow, joka ohittaisi hyökkäystarkistukset.
Managed rules voi estää myös kelvollista sisältöä (esimerkiksi yli 8 KiB:n
rungon); demo testataan normaaleilla kirjautumis- ja ostoslistapyynnöillä.
WAF-mittarit ovat käytössä; täydelliset pyyntölokit ja sampled requests eivät.

S3 on yksityinen ja CloudFront käyttää Origin Access Controlia. API Gatewayn
osoite on julkisesti reititettävissä, mutta Lambda hylkää pyynnön ennen
sovelluslogiikkaa, ellei mukana ole CloudFrontin lisäämää salaista otsaketta.
Secrets Manager generoi tämän arvon. CloudFront ylikirjoittaa asiakkaan
samannimisen otsakkeen. Suorat API-pyynnöt voivat silti aiheuttaa API/Lambda-kuluja:
tämä ei tee API Gatewaysta yksityistä verkkopalvelua. Älä kierrätä origin-secretia
käsin ilman molempien kuluttajien koordinoitua päivitystä.

Demokäyttäjä luodaan jokaisella deploylla suolatusta scrypt-tiivisteestä;
selväkielistä salasanaa ei välitetä CloudFormationille. Sama käyttäjänimi säilyttää
ostoslistansa päivityksessä. Käyttäjänimen vaihto ei poista vanhaa käyttäjää,
eikä salasanan vaihto peruuta olemassa olevia tunnin istuntoja.

## Ympäristön poistaminen

**Actions → Destroy demo → Run workflow → main**. Kirjoita vahvistuskenttään
`DELETE porridgepot-demo`. Ajo poistaa ensin sovellusstackin ja sitten WAF-stackin.
Deploy ja destroy käyttävät samaa concurrency-ryhmää. Peruuta jonossa olevat
deploy-ajot ennen poistoa, jos et halua niiden luovan ympäristöä uudestaan.
GitHub voi korvata aiemman jonossa olevan ajon uudemmalla; tämä ei ole FIFO-jono.

Poistuvat: CloudFront, API, Lambdat, WAF/IP-setti, origin-secret, sovelluslokit,
**DynamoDB käyttäjineen/istuntoineen/ostoslistoineen sekä S3 sisältöineen**.
Poisto voi kestää useita minuutteja. Varmista molempien stackien DELETE_COMPLETE;
epäonnistunut poisto pitää korjata, eikä pelkkä ajon käynnistäminen lopeta laskutusta.

Bootstrap-stackit ja niiden assetit, AWS-tili, Identity Center ja OIDC-rooli jäävät.
Bootstrap-S3:n assetit voivat aiheuttaa pieniä säilytyskuluja: koko AWS-tilin laskua
ei luvata nollaksi. Uusi deploy luo sovelluksen ja demokäyttäjän uudelleen, mutta
ei palauta poistettua dataa. CloudFront-osoite voi muuttua.
Paikallinen vastine: `DESTROY_CONFIRM='DELETE porridgepot-demo' npm run destroy:demo`
(SSO-profiili asetettuna). Älä käytä tätä mallia arvokkaan tuotantodatan kanssa.

## Toteutussopimus ja ylläpito

Käsin hyväksytty tehtävä: WAF-suojattu oikea demodeploy sekä täydellinen demo-stackien
poisto ja uudelleenluonti. Omistus: `infra/`, `apps/api/` origin-tarkistus,
`tools/demo.mjs`, `tools/github-delivery.mjs`, deploy/destroy-workflow't,
`tests/` ja niitä kuvaavat ohjeet. Ei numeroitua speksiä, joka käynnistäisi plannerin.
Hyväksymiskriteerit: offline-check läpäisee; väärä tili ja avoin IP-verkko estetään;
API ei ohita CloudFront-suojausta; WAF julkaistaan ensin ja poistetaan viimeisenä;
salaisuudet eivät ole templateissa; demo-data ja lokit poistuvat stackien mukana.
`tests/aws-demo.test.mjs` kattaa nämä ilman AWS-kutsuja. Pilvitesti: sallittu IP
pääsee kirjautumaan ja tallentamaan listan, muu IP saa 403, suora API saa 403;
Destroy demo ja uusi deploy palauttavat toimivan mutta tyhjän ympäristön.

Lähteet: [CloudFrontin origin-otsakkeet](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/add-origin-custom-headers.html),
[WAF-sääntöjen toiminta](https://docs.aws.amazon.com/waf/latest/developerguide/web-acl-rule-actions.html),
[GitHub OIDC](https://docs.github.com/en/actions/reference/security/oidc),
[CDK bootstrap](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-customizing.html).
