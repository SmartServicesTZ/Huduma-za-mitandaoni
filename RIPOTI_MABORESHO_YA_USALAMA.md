# Ripoti Fupi ya Maboresho ya Usalama

**Mfumo:** Huduma za Mtandao  
**Madhumuni:** Kuwajulisha wateja na wadau kuhusu hatua zilizochukuliwa kuimarisha usalama wa mfumo.

## Muhtasari

Tumeimarisha usalama wa tovuti kwa kulinda taarifa za akaunti, kusimamia kwa ukali uwezo wa wasimamizi, kuzuia matumizi mabaya ya tokeni, na kuhamisha shughuli nyeti kwenda kwenye backend salama. Maboresho haya yanalenga kupunguza hatari ya udanganyifu, mabadiliko yasiyoidhinishwa, na upotevu wa taarifa.

## Maboresho yaliyofanyika

### 1. Ulinzi wa akaunti na taarifa binafsi

- Password, PIN na credential fields hazihifadhiwi kwenye profiles za Firestore.
- Taarifa za credential zilizorithiwa zinatambuliwa na kusafishwa kupitia migration salama.
- Watumiaji wanaweza kubadilisha password kupitia Firebase Authentication.
- Picha za profile sasa zinahifadhiwa kwenye Firebase Storage yenye ruhusa maalum, badala ya kuhifadhiwa moja kwa moja kama data kwenye profile.
- Picha zinakubaliwa ikiwa ni JPG, PNG au WebP, na ukubwa wake hauzidi MB 2.

### 2. Udhibiti wa tokeni

- Matumizi ya tokeni yanafanyika kwa transaction ya atomiki.
- Mfumo huzuia salio kwenda chini ya sifuri.
- Request inayojirudia haiwezi kukata tokeni mara mbili.
- Kila matumizi au marekebisho ya tokeni yana ledger yenye reference, salio la awali, salio jipya, sababu na muda wa tukio.

### 3. Permissions za wasimamizi

Tumeanzisha permissions zinazotenganisha majukumu ya wasimamizi, ikiwemo:

- Kuona watumiaji
- Kusimamia watumiaji
- Kusimamia tokeni
- Kusimamia huduma
- Kusimamia maudhui
- Kutuma ujumbe
- Kuona ripoti
- Kusimamia settings
- Kusimamia leseni
- Kuona audit logs

Hii inamaanisha mtumiaji mwenye role ya admin hawezi moja kwa moja kufanya kila kitendo bila permission husika.

### 4. Ulinzi wa Super Admin

- Admin wa kawaida hawezi kujipa role ya Super Admin.
- Super Admin hawezi kujiblock, kujifuta, au kubadilisha role na permissions zake mwenyewe.
- Mabadiliko ya access na account status yanafanyika kupitia backend yenye permission checks.

### 5. Audit logs zisizobadilika

- Tumeanzisha collection ya `adminActions` kwa historia ya shughuli za kiutawala.
- Kila tukio lina mhusika, role yake, aina ya kitendo, target, taarifa za kabla na baada, pamoja na muda wa tukio.
- Audit actions haziwezi kuhaririwa au kufutwa kupitia mfumo wa kawaida.
- Hii husaidia katika ufuatiliaji, uchunguzi wa matukio na uwajibikaji.

### 6. Backend na App Check

- Shughuli nyeti kama tokeni, access, verification, account status na CMS sasa zinapitia callable Cloud Functions zenye Firebase Admin SDK.
- Frontend haiwezi tena kuandika moja kwa moja baadhi ya collections za kiutawala.
- Firebase App Check imeandaliwa ili kusaidia kuthibitisha kuwa requests zinatoka kwenye application halali.
- App Check enforcement itawashwa baada ya staging tests na configuration ya Firebase kukamilika.

## Faida kwa wateja na wadau

- Kupunguza uwezekano wa akaunti kutumiwa bila ruhusa.
- Kulinda salio na historia ya tokeni dhidi ya makato ya kurudiwa au udanganyifu.
- Kuweka mipaka ya wazi ya majukumu ya wasimamizi.
- Kuongeza uwazi wa matukio ya kiutawala kupitia audit trail.
- Kulinda picha na taarifa binafsi kwa ruhusa za user husika.
- Kuweka msingi wa monitoring, backups na recovery drills za baadaye.

## Hali ya utekelezaji

Mabadiliko yamekamilisha ukaguzi wa code, type-checks, tests na production build bila errors. Hata hivyo, deployment ya Firebase Functions, Firestore rules, Storage rules na App Check enforcement bado inahitaji kufanyika kwenye staging project kabla ya kwenda production.

> Usalama ni mchakato endelevu. Baada ya staging verification, hatua zinazofuata ni deployment salama, backup/restore drills, emulator security tests na monitoring ya matukio muhimu.
