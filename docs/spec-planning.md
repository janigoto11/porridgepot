# Speksin valinta ja suunnittelu

Kirjoita yksi selkokielinen speksi tiedostoon `specs/NNNN-nimi.md`. Numeron pitää olla yksilöllinen. Kerro tavoite, rajaus ja havaittavat hyväksymiskriteerit. Esimerkiksi tekstimuutosdemossa pyydä vaihtamaan tietty sivuteksti ja rajaamaan toteutus apps/web/-hakemistoon.

Main-push valitsee koko before/after-commitvälin lisätyt tai muuttuneet numeroidut Markdown-speksit. Valinta tehdään Gitistä ilman GitHubin paths-filtterin tiedostomäärärajaa. Poistot ja muut tiedostot ohitetaan. Ensimmäinen push valitsee kaikki numeroidut speksit. Yhdessä pushissa sallitaan enintään 16 speksiä ja kaksi suunnitteluajoa rinnakkain. Plan-workflow voidaan myös käynnistää käsin tarkalla speksipolulla.

Claude Code saa speksin ja konfiguraation salliman versionhallintaan tallennetun lähdekoodikontekstin. Tuloksena on 1–8 tehtävää: id, owner, description, spec, allowedPaths, acceptanceCriteria ja dependsOn. Harness validoi skeeman, omistuspolut ja riippuvuussyklit. Se lisää plan-dokumenttiin speksin SHA-256-tiivisteen, lähtöcommitin ja mallin tiedot.

Planin JSON ja siitä muodostettu luettava Markdown tallennetaan `plans/NNNN-<lähtöcommit>.json/.md`-tiedostoihin plan-PR:ssä. Niitä ei kirjoiteta takaisin speksihakemistoon, joten plan-PR:n merge ei laukaise uutta suunnittelua. Se käynnistää toteutuksen. Uusi speksiversio saa oman plan-PR:n; vanhaa ei muuteta hiljaisesti.

Paikallinen `npm run ai:plan -- specs/NNNN-nimi.md` tuottaa edelleen vain .ai/-artefaktit. Se vaatii commitoidun speksin, asennetun Claude Code CLI:n ja autentikoinnin; älä aja sitä vahingossa, sillä se käyttää mallipalvelua. Testit korvaavat palvelukutsut testivastauksilla.

Nykyiset workflow't käyttävät `CLAUDE_CODE_OAUTH_TOKEN`-repository secretia. Tokenin lisääminen on erillinen käyttöönottovaihe. Suora Anthropic API -adapteri on vaihtoehto plannerille, mutta sen API-avain on eri tunniste. Katso [koko PR-ketju ja asetukset](pr-delivery.md).
