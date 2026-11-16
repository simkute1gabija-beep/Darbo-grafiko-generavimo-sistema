# Darbo grafiko sistema

Sistema generuoja mėnesio pamainų grafiką pagal darbuotojų prieinamumą, etatą, mėnesio valandų normą ir kiekvienam laiko intervalui įvestą darbuotojų poreikį. Sugeneruotame grafike matyti paskirtos pamainos, nepadengti intervalai ir mėnesio valandų suvestinė. Demonstracijai paruoštos dvi įmonės – „CoffeePoint“ ir „UrbanStyle“.


## Reikalingi įrankiai
- Node.js 24 ir npm 11. Versijas patikrinsite komandomis node --version ir npm --version.
- MariaDB arba MySQL. „Windows“ sistemoje galima naudoti XAMPP su phpMyAdmin. XAMPP valdymo skydelyje paleiskite MySQL ir Apache, kad galėtumėte naudoti phpMyAdmin.
- Programos serverį paleidžia „Node.js“.


## Duomenų bazė
1. Paleiskite „MySQL“ per XAMPP ir atidarykite phpMyAdmin.
2. Pasirinkite Importuoti ir pirmiausia įkelkite projekto aplanke esantį schema.sql. Jis sukuria work_schedule duomenų bazę ir jos lenteles.
3. Baigę pirmą importą, pasirinkite work_schedule duomenų bazę ir importuokite seed.sql. Jis įrašo „CoffeePoint“ ir „UrbanStyle“ įmones, jų darbuotojus bei darbuotojų prieinamumą 2026 m. lapkričio 10–16 d.
4. Prisijungimo prie duomenų bazės nustatymus rasite src/database.js faile. Jei jūsų vietinės duomenų bazės nustatymai skiriasi, atnaujinkite atitinkamas reikšmes šiame faile.


## Paleidimas
Terminale atidarykite projekto aplanką, kuriame yra package.json, ir paleiskite:
- npm ci
- npm start

Naršyklėje atidarykite http://localhost:3000. Jei „PowerShell“ blokuoja npm.ps1, naudokite npm.cmd ci ir npm.cmd start.


## Demonstravimas
1. Pradiniame puslapyje pasirinkite CoffeePoint ir išskleiskite skiltį Darbuotojai. Sąraše matysite, pavyzdžiui, Mariją Kavaliauskienę, Karoliną Daukšaitę ir Eglę Urbonienę.
2. Pasirinkite 2026 m. lapkritį ir išskleiskite skiltį Visų darbuotojų prieinamumas. Pavyzdiniai įrašai pateikti lapkričio 10–16 d. Norėdami išbandyti redagavimą, prieinamumo formoje pasirinkite Karoliną Daukšaitę ir lapkričio 16 d., pakeiskite jos laiką į 10:00–15:00 ir spauskite Išsaugoti. Patikrinkite, ar naujas laikas rodomas prieinamumo kalendoriuje.
3. Darbuotojų poreikio laukuose nustatykite 1 nuo 10:00 iki 13:00, 1 nuo 13:00 iki 16:00 ir 2 nuo 16:00 iki 20:00. Spauskite Generuoti grafiką. Peržiūrėkite paskirtas pamainas, mėnesio valandų suvestinę ir, jei poreikis nepadengtas, pažymėtus trūkumus.
4. Spauskite Atsijungti, pasirinkite UrbanStyle ir vėl išskleiskite skiltį Darbuotojai. Patikrinkite, ar sąraše rodomi tik „UrbanStyle“ darbuotojai, pavyzdžiui, Jonas Petrauskas ir Ieva Kazlauskaitė.


## Testavimas
Palikite įjungtą DB ir programą adresu http://localhost:3000. Antrame terminale, projekto aplanke, paleiskite:
- npm test

„PowerShell“ aplinkoje prireikus naudokite npm.cmd test.


## Laukiamas rezultatas – 4 praėję testai:
- Įprastas scenarijus patikrina, kad paskiriamos dvi skirtingos darbuotojos ir vadovo fiksuota pamaina įtraukiama į grafiką.
- Ribinis scenarijus patikrina, kad darbuotoja pasiekia 84 val. mėnesio normą ir likusiam intervalui pranešama apie trūkumą.
- Nepadengiamo poreikio scenarijus patikrina, kad paskiriami du iš trijų reikalingų darbuotojų.
- Izoliavimo testas palygina abiejų įmonių darbuotojų sąrašus, grąžinamus per API, su atitinkamais DB įrašais.

Vien grafiko generatoriaus testus galima paleisti ir be DB bei serverio:
- node --test tests/scheduleGenerator.test.js


## Svarbu 
Schema.sql ištrina ir iš naujo sukuria esamas projekto lenteles. Jei work_schedule duomenų bazė jau paruošta ir norite išsaugoti jos duomenis, abu importavimo žingsnius praleiskite.