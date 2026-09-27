<?php
declare(strict_types=1);

session_set_cookie_params([
    'httponly' => true,
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'samesite' => 'Lax',
]);
session_start();
header('Cache-Control: private, no-store, max-age=0');
header('Pragma: no-cache');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
require __DIR__ . '/vendor/autoload.php';


$locationData = json_decode((string) file_get_contents(__DIR__ . '/data/tanzaniaLocations.json'), true, 512, JSON_THROW_ON_ERROR);
$regions = $locationData['regions'] ?? [];
$businessTypes = [
    'GENERAL RETAIL SHOP', 'WHOLESALE BUSINESS', 'MOBILE PHONE SHOP', 'ELECTRONICS SHOP',
    'STATIONERY SHOP', 'RESTAURANT', 'FOOD VENDOR', 'CLOTHING SHOP', 'HARDWARE SHOP',
    'SALON', 'BARBERSHOP', 'CAR WASH', 'GROCERY SHOP', 'PHARMACY', 'COMPUTER SERVICES',
    'REPAIR SERVICES', 'TRANSPORT SERVICES', 'AGRICULTURAL INPUTS', 'POULTRY BUSINESS',
    'HOTEL', 'LODGE', 'SUPERMARKET', 'INTERNET CAFE', 'OTHER',
];

if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function validateApplication(array $post, array $regions, array $businessTypes): array
{
    $v = static function (string $key, int $max = 160) use ($post): string {
        $value = $post[$key] ?? '';
        if (!is_string($value)) {
            return '';
        }
        $value = trim(preg_replace('/[\r\n\t]+/u', ' ', $value) ?? '');
        return mb_substr($value, 0, $max, 'UTF-8');
    };

    $form = [
        'firstName' => mb_strtoupper($v('firstName', 80), 'UTF-8'),
        'middleName' => mb_strtoupper($v('middleName', 80), 'UTF-8'),
        'lastName' => mb_strtoupper($v('lastName', 80), 'UTF-8'),
        'tin' => preg_replace('/[^0-9-]/', '', $v('tin', 20)) ?? '',
        'businessType' => $v('businessType', 100),
        'otherBusinessType' => mb_strtoupper($v('otherBusinessType', 100), 'UTF-8'),
        'applicationType' => $v('applicationType', 20),
        'principalBranch' => $v('principalBranch', 20),
        'region' => $v('region', 80),
        'district' => $v('district', 100),
        'ward' => $v('ward', 100),
        'street' => $v('street', 140),
        'estimatedFee' => $v('estimatedFee', 20),
    ];

    $errors = [];
    if ($form['firstName'] === '' || $form['lastName'] === '') $errors[] = 'Jina la kwanza na jina la mwisho vinahitajika.';
    if (!preg_match('/^\d{3}-\d{3}-\d{3}$/', $form['tin'])) $errors[] = 'TIN lazima iwe katika muundo 123-456-789.';
    if (!in_array($form['businessType'], $businessTypes, true)) $errors[] = 'Chagua aina ya biashara kutoka kwenye orodha.';
    if ($form['businessType'] === 'OTHER' && $form['otherBusinessType'] === '') $errors[] = 'Eleza aina nyingine ya biashara.';
    if (!in_array($form['applicationType'], ['NEW LICENCE', 'RENEWED LICENCE'], true)) $errors[] = 'Chagua aina ya ombi.';
    if (!in_array($form['principalBranch'], ['PRINCIPAL', 'BRANCH'], true)) $errors[] = 'Chagua biashara kuu au tawi.';

    if (!isset($regions[$form['region']]['districts'])) {
        $errors[] = 'Chagua Mkoa halali.';
    } elseif (!isset($regions[$form['region']]['districts'][$form['district']])) {
        $errors[] = 'Chagua Halmashauri/Wilaya inayolingana na Mkoa.';
    } elseif (!in_array($form['ward'], $regions[$form['region']]['districts'][$form['district']], true)) {
        $errors[] = 'Chagua Kata inayolingana na Halmashauri/Wilaya.';
    }
    if ($form['street'] === '') $errors[] = 'Jaza Mtaa/Kijiji.';

    $fee = $form['estimatedFee'];
    if ($fee !== '' && (!is_numeric($fee) || (float) $fee < 0 || (float) $fee > 100000000)) {
        $errors[] = 'Makadirio ya ada si sahihi.';
    }
    $form['estimatedFee'] = $fee === '' ? '' : number_format((float) $fee, 2, '.', '');
    return [$form, $errors];
}

function pdfText(string $value): string
{
    return iconv('UTF-8', 'windows-1252//TRANSLIT', $value) ?: $value;
}

function makeDraftPdf(array $form, string $applicationId): never
{
    $pdf = new \FPDF('P', 'mm', 'A4');
    $pdf->SetAutoPageBreak(true, 16);
    $pdf->AddPage();
    $pdf->SetDrawColor(42, 131, 167);
    $pdf->SetLineWidth(1.2);
    $pdf->Rect(8, 8, 194, 281);

    $pdf->SetFont('Arial', 'B', 17);
    $pdf->SetTextColor(17, 42, 58);
    $pdf->SetXY(16, 17);
    $pdf->Cell(178, 9, pdfText('OMBI LA LESENI YA BIASHARA'), 0, 1, 'C');
    $pdf->SetFont('Arial', 'B', 11);
    $pdf->SetTextColor(31, 105, 135);
    $pdf->Cell(178, 7, 'BUSINESS LICENSE APPLICATION', 0, 1, 'C');

    $pdf->SetFillColor(255, 243, 205);
    $pdf->SetTextColor(122, 74, 0);
    $pdf->SetDrawColor(231, 196, 106);
    $pdf->SetFont('Arial', 'B', 12);
    $pdf->SetXY(18, 39);
    $pdf->Cell(174, 11, pdfText('RASIMU TU - SI LESENI RASMI'), 1, 1, 'C', true);

    $pdf->SetFont('Arial', '', 9);
    $pdf->SetTextColor(60, 75, 86);
    $pdf->SetXY(18, 54);
    $pdf->Cell(42, 6, 'Rejea ya rasimu:', 0, 0);
    $pdf->SetFont('Arial', 'B', 9);
    $pdf->Cell(132, 6, $applicationId, 0, 1);
    $pdf->SetFont('Arial', '', 8);
    $pdf->SetTextColor(80, 90, 100);
    $pdf->SetX(18);
    $pdf->MultiCell(174, 5, pdfText('Rasimu hii ni ya kukagua taarifa za ombi pekee. Haithibitishi idhini, malipo au uhalali wa kuendesha biashara.'), 0, 'C');

    $section = static function (string $title) use ($pdf): void {
        $pdf->Ln(2);
        $pdf->SetFillColor(226, 241, 246);
        $pdf->SetTextColor(18, 72, 91);
        $pdf->SetFont('Arial', 'B', 10);
        $pdf->Cell(174, 7, pdfText($title), 0, 1, 'L', true);
    };
    $row = static function (string $label, string $value) use ($pdf): void {
        $pdf->SetX(18);
        $pdf->SetFont('Arial', '', 8.5);
        $pdf->SetTextColor(76, 87, 96);
        $pdf->Cell(58, 6, pdfText($label), 0, 0);
        $pdf->SetFont('Arial', 'B', 8.5);
        $pdf->SetTextColor(20, 31, 40);
        $pdf->MultiCell(116, 6, pdfText($value !== '' ? $value : '—'), 0, 'L');
        $pdf->SetDrawColor(220, 228, 232);
        $pdf->Line(18, $pdf->GetY(), 192, $pdf->GetY());
    };

    $section('License Details / Taarifa za Leseni');
    $row('Ofisi inayotoa leseni:', 'Itathibitishwa na mamlaka husika baada ya mapitio.');
    $row('Tax Identification No:', $form['tin']);
    $row('License Issued To / Mwombaji:', trim($form['firstName'] . ' ' . $form['middleName'] . ' ' . $form['lastName']));
    $row('For the Business of:', $form['businessType'] === 'OTHER' ? $form['otherBusinessType'] : $form['businessType']);
    $row('Business Licensing / Aina ya ombi:', $form['applicationType']);
    $row('Namba rasmi ya B.L. NO:', 'Hutolewa na mamlaka baada ya idhini.');
    $row('Date of Issue / Tarehe ya kutolewa:', 'Hutolewa na mamlaka baada ya idhini.');
    $row('Expiring Date / Tarehe ya kuisha:', 'Hutolewa na mamlaka baada ya idhini.');
    $row('Principal/Branch:', $form['principalBranch']);

    $section('Business Location / Eneo la Biashara');
    $row('Region / Mkoa:', $form['region']);
    $row('Halmashauri/Wilaya:', $form['district']);
    $row('Ward / Kata:', $form['ward']);
    $row('Street / Mtaa-Kijiji:', $form['street']);

    $section('Payment Details / Makadirio ya Ada');
    $row('Amount of Fee Paid:', 'Haijathibitishwa — hakuna risiti ya malipo kwenye rasimu.');
    $row('Makadirio ya ada (hiari):', $form['estimatedFee'] === '' ? 'Haijawekwa' : number_format((float) $form['estimatedFee'], 2) . ' TZS');

    $placeholderY = $pdf->GetY() + 5;
    $pdf->SetDrawColor(150, 164, 171);
    $pdf->SetLineWidth(0.4);
    $pdf->Rect(139, $placeholderY, 51, 29);
    $pdf->SetXY(141, $placeholderY + 5);
    $pdf->SetFont('Arial', 'B', 8);
    $pdf->SetTextColor(80, 95, 103);
    $pdf->MultiCell(47, 4, pdfText('SEHEMU YA QR RASMI'), 0, 'C');
    $pdf->SetFont('Arial', '', 7);
    $pdf->MultiCell(47, 4, pdfText('Huongezwa na mamlaka baada ya idhini.'), 0, 'C');
    $pdf->SetY($placeholderY + 32);

    $pdf->Ln(5);
    $pdf->SetFont('Arial', 'B', 9);
    $pdf->SetTextColor(122, 74, 0);
    $pdf->MultiCell(174, 6, pdfText('Namba rasmi ya leseni, tarehe za uhalali na QR ya uthibitisho havipo kwenye rasimu hii. Hutolewa na mamlaka husika baada ya mapitio na idhini.'), 0, 'C');
    $pdf->Ln(2);
    $pdf->SetDrawColor(42, 131, 167);
    $pdf->Line(18, $pdf->GetY(), 192, $pdf->GetY());
    $pdf->Ln(3);
    $pdf->SetFont('Arial', 'B', 8);
    $pdf->SetTextColor(31, 105, 135);
    $pdf->MultiCell(174, 5, pdfText('RASIMU YA OMBI PEKEE - SI LESENI RASMI WALA RISITI YA MALIPO'), 0, 'C');
    $pdf->SetFont('Arial', '', 7.5);
    $pdf->SetTextColor(80, 90, 100);
    $pdf->MultiCell(174, 5, pdfText('Wasilisha ombi lako kwa mamlaka ya leseni kwa uthibitishaji, tathmini ya ada na idhini.'), 0, 'C');

    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="rasimu-ombi-leseni.pdf"');
    header('Cache-Control: private, no-store, max-age=0');
    header('X-Content-Type-Options: nosniff');
    $pdf->Output('D', 'rasimu-ombi-leseni.pdf');
    exit;
}

$errors = [];
$form = [
    'firstName' => '', 'middleName' => '', 'lastName' => '', 'tin' => '',
    'businessType' => '', 'otherBusinessType' => '', 'applicationType' => '', 'principalBranch' => '',
    'region' => '', 'district' => '', 'ward' => '', 'street' => '', 'estimatedFee' => '',
];
$download = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($_SESSION['csrf'], is_string($_POST['csrf'] ?? null) ? $_POST['csrf'] : '')) {
        http_response_code(400);
        $errors[] = 'Ombi limeisha muda. Pakia upya ukurasa kisha jaribu tena.';
    } else {
        [$form, $errors] = validateApplication($_POST, $regions, $businessTypes);
        $download = ($_POST['action'] ?? '') === 'download' && !$errors;
        if ($download) {
            $applicationId = 'APP-' . strtoupper(bin2hex(random_bytes(6)));
            makeDraftPdf($form, $applicationId);
        }
    }
}

$districts = $form['region'] !== '' ? array_keys($regions[$form['region']]['districts'] ?? []) : [];
$wards = $form['district'] !== '' ? ($regions[$form['region']]['districts'][$form['district']] ?? []) : [];
$old = static fn(string $key): string => e($form[$key] ?? '');
$locationJson = json_encode($regions, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE);
?>
<!doctype html>
<html lang="sw">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Rasimu ya Ombi la Leseni ya Biashara</title>
  <style>
    :root{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#14212b;background:#eef4f7;font-synthesis:none}*{box-sizing:border-box}body{margin:0}.shell{max-width:1120px;margin:0 auto;padding:28px 18px 56px}.top{display:flex;align-items:center;justify-content:space-between;color:#475569;font-size:13px}.brand{font-weight:800;letter-spacing:.04em;color:#0e526b}.hero{margin:25px 0 18px;color:#f8fafc;background:linear-gradient(125deg,#0e3d52,#14667c);padding:25px;border-radius:18px}.hero small{color:#a8d8e4;font-weight:800;letter-spacing:.12em}.hero h1{margin:7px 0;font-size:clamp(25px,4vw,36px)}.hero p{margin:0;color:#d7eaf0;line-height:1.6}.alert{display:flex;gap:12px;padding:14px 16px;border:1px solid #e9ca7d;border-radius:12px;color:#704900;background:#fff8e6;font-size:13px;line-height:1.55}.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,.8fr);gap:18px;align-items:start;margin-top:18px}.card{padding:22px;border:1px solid #dbe5e9;border-radius:16px;background:white;box-shadow:0 10px 25px #1536470d}.card h2{margin:0 0 5px;font-size:19px}.sub{margin:0 0 20px;color:#657681;font-size:13px}.section{padding:18px 0 2px;border-top:1px solid #e9eff2}.section h3{margin:0 0 13px;color:#13566c;font-size:14px}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field{display:grid;gap:6px;margin-bottom:10px;color:#344852;font-size:12px;font-weight:700}.field small{color:#788992;font-size:10px;font-weight:500}.field input,.field select{width:100%;height:42px;padding:9px 11px;border:1px solid #cbd8de;border-radius:8px;background:#fbfdfe;font:inherit;color:#152630}.field input:focus,.field select:focus{outline:3px solid #57a6bd33;border-color:#1683a0}.hint{color:#7b5a12;font-size:11px;line-height:1.5}.actions{display:flex;flex-wrap:wrap;gap:10px;padding-top:16px}.btn{border:0;border-radius:9px;padding:11px 14px;font-size:12px;font-weight:800;cursor:pointer}.btn-primary{color:#fff;background:#126a80}.btn-secondary{color:#17566c;background:#e7f2f5}.errors{margin:14px 0;padding:12px 15px;border:1px solid #f3b6b6;border-radius:10px;color:#8a2020;background:#fff1f1;font-size:13px}.errors li+li{margin-top:5px}.preview{position:sticky;top:14px}.paper{position:relative;overflow:hidden;padding:24px 22px;border:3px solid #3286a2;background:#f3f8fa;box-shadow:inset 0 0 0 5px #fff;color:#15232b}.paper-title{text-align:center}.paper-title b,.paper-title span,.paper-title small{display:block}.paper-title b{font-size:16px;letter-spacing:.02em}.paper-title span{margin-top:5px;font-size:11px;color:#317f98;font-weight:800}.paper-title small{margin-top:7px;font-size:9px;color:#586e78}.ribbon{margin:14px 0 9px;padding:8px;border:1px solid #e4c36b;border-radius:4px;background:#fff4cf;color:#805200;text-align:center;font-size:11px;font-weight:900}.ref{margin-bottom:12px;text-align:center;color:#58717e;font-size:9px;overflow-wrap:anywhere}.p-section{margin-top:13px}.p-section h3{margin:0 0 7px;padding-bottom:5px;border-bottom:1px solid #c6d7df;color:#185e74;font-size:11px}.row{display:grid;grid-template-columns:40% 60%;gap:5px;padding:4px 0;border-bottom:1px solid #e2eaed;font-size:9px;line-height:1.4}.row span{color:#5b6c74}.row strong{overflow-wrap:anywhere}.stamp{margin:12px 0 8px;padding:9px;border:1px dashed #b28327;background:#fffae9;color:#79540f;text-align:center;font-size:10px;font-weight:900}.foot{margin-top:10px;padding-top:8px;border-top:1px solid #9aabb2;color:#52646d;text-align:center;font-size:8px;line-height:1.5}.foot strong{display:block;color:#17576d;font-size:9px}.muted{color:#87969d}.required{color:#b91c1c}@media(max-width:850px){.grid{grid-template-columns:1fr}.preview{position:static}.preview-card{order:-1}}@media(max-width:520px){.shell{padding:17px 11px 35px}.card{padding:16px}.fields{grid-template-columns:1fr}.hero{padding:19px}}
  </style>
</head>
<body>
<div class="shell">
  <div class="top"><span class="brand">HUDUMA ZA MTANDAONI</span><span>Rasimu ya ombi · PDF</span></div>
  <header class="hero"><small>FOMU YA KUJAZA TAARIFA</small><h1>Ombi la Leseni ya Biashara</h1><p>Jaza taarifa zako. Hakikisho litabadilika moja kwa moja; unaweza kupakua PDF ya rasimu kwa ajili ya kukagua kabla ya kuiwasilisha kwa mamlaka husika.</p></header>
  <div class="alert"><strong>RASIMU TU</strong><span>PDF hii si leseni rasmi wala risiti ya malipo. Namba ya leseni, tarehe za uhalali na QR ya uthibitisho hutolewa na mamlaka baada ya mapitio na idhini.</span></div>

  <?php if ($errors): ?><div class="errors" role="alert"><b>Tafadhali kagua yafuatayo:</b><ul><?php foreach ($errors as $error): ?><li><?= e($error) ?></li><?php endforeach; ?></ul></div><?php endif; ?>

  <div class="grid">
    <form class="card" method="post" action="" autocomplete="on">
      <h2>Taarifa za mwombaji</h2><p class="sub">Sehemu zenye nyota nyekundu zinahitajika.</p>
      <input type="hidden" name="csrf" value="<?= e($_SESSION['csrf']) ?>">
      <div class="section"><h3>1. Mwombaji</h3><div class="fields">
        <label class="field">Jina la kwanza <span class="required">*</span><input name="firstName" maxlength="80" value="<?= $old('firstName') ?>" required></label>
        <label class="field">Jina la kati <small>Hiari</small><input name="middleName" maxlength="80" value="<?= $old('middleName') ?>"></label>
        <label class="field">Jina la mwisho <span class="required">*</span><input name="lastName" maxlength="80" value="<?= $old('lastName') ?>" required></label>
        <label class="field">TIN <span class="required">*</span><small>Muundo: 123-456-789</small><input name="tin" inputmode="numeric" maxlength="11" placeholder="123-456-789" value="<?= $old('tin') ?>" required></label>
      </div></div>
      <div class="section"><h3>2. Biashara</h3><div class="fields">
        <label class="field">Aina ya biashara <span class="required">*</span><select name="businessType" required><option value="">Chagua</option><?php foreach ($businessTypes as $type): ?><option value="<?= e($type) ?>" <?= $form['businessType'] === $type ? 'selected' : '' ?>><?= e($type) ?></option><?php endforeach; ?></select></label>
        <label class="field" id="other-wrap" <?= $form['businessType'] === 'OTHER' ? '' : 'hidden' ?>>Aina nyingine <span class="required">*</span><input name="otherBusinessType" maxlength="100" value="<?= $old('otherBusinessType') ?>"></label>
        <label class="field">Aina ya ombi <span class="required">*</span><select name="applicationType" required><option value="">Chagua</option><option value="NEW LICENCE" <?= $form['applicationType'] === 'NEW LICENCE' ? 'selected' : '' ?>>Ombi jipya</option><option value="RENEWED LICENCE" <?= $form['applicationType'] === 'RENEWED LICENCE' ? 'selected' : '' ?>>Kuomba upya</option></select></label>
        <label class="field">Eneo <span class="required">*</span><select name="principalBranch" required><option value="">Chagua</option><option value="PRINCIPAL" <?= $form['principalBranch'] === 'PRINCIPAL' ? 'selected' : '' ?>>Biashara kuu</option><option value="BRANCH" <?= $form['principalBranch'] === 'BRANCH' ? 'selected' : '' ?>>Tawi</option></select></label>
      </div></div>
      <div class="section"><h3>3. Eneo la biashara</h3><div class="fields">
        <label class="field">Mkoa <span class="required">*</span><select id="region" name="region" required><option value="">Chagua Mkoa</option><?php foreach ($regions as $name => $_): ?><option value="<?= e((string) $name) ?>" <?= $form['region'] === $name ? 'selected' : '' ?>><?= e((string) $name) ?></option><?php endforeach; ?></select></label>
        <label class="field">Halmashauri / Wilaya <span class="required">*</span><select id="district" name="district" required><option value="">Chagua</option><?php foreach ($districts as $district): ?><option value="<?= e((string) $district) ?>" <?= $form['district'] === $district ? 'selected' : '' ?>><?= e((string) $district) ?></option><?php endforeach; ?></select></label>
        <label class="field">Kata <span class="required">*</span><select id="ward" name="ward" required><option value="">Chagua</option><?php foreach ($wards as $ward): ?><option value="<?= e((string) $ward) ?>" <?= $form['ward'] === $ward ? 'selected' : '' ?>><?= e((string) $ward) ?></option><?php endforeach; ?></select></label>
        <label class="field">Mtaa / Kijiji <span class="required">*</span><input name="street" maxlength="140" value="<?= $old('street') ?>" required></label>
      </div></div>
      <div class="section"><h3>4. Makadirio ya ada (hiari)</h3><label class="field">Makadirio (TZS)<small>Si uthibitisho wa malipo</small><input type="number" name="estimatedFee" min="0" max="100000000" step="0.01" placeholder="Haijawekwa" value="<?= $old('estimatedFee') ?>"></label><p class="hint">Usiwasilishe makadirio haya kama ada iliyolipwa; malipo huthibitishwa na mamlaka husika.</p></div>
      <div class="actions"><button class="btn btn-secondary" type="submit" name="action" value="preview">Onyesha hakikisho</button><button class="btn btn-primary" type="submit" name="action" value="download">Pakua rasimu PDF</button></div>
    </form>

    <aside class="card preview" aria-live="polite"><h2>Hakikisho la moja kwa moja</h2><p class="sub">Muonekano huu ni rasimu tu.</p><div class="paper">
      <div class="paper-title"><b>OMBI LA LESENI YA BIASHARA</b><span>BUSINESS LICENSE APPLICATION</span><small>HUDUMA ZA MTANDAONI</small></div>
      <div class="ribbon">RASIMU TU — SI LESENI RASMI</div>
      <div class="ref">Rejea: Hutengenezwa unapopakua rasimu</div>
      <div class="p-section"><h3>LICENSE DETAILS</h3><div class="row"><span>Issuing Office:</span><strong>Huthibitishwa na mamlaka</strong></div><div class="row"><span>Tax Identification No:</span><strong id="pv-tin">—</strong></div><div class="row"><span>License Issued To:</span><strong id="pv-name">—</strong></div><div class="row"><span>For the Business of:</span><strong id="pv-type">—</strong></div><div class="row"><span>Business Licensing:</span><strong id="pv-app">—</strong></div><div class="row"><span>B.L. NO:</span><strong>Hutolewa baada ya idhini</strong></div><div class="row"><span>Date of Issue:</span><strong>Hutolewa baada ya idhini</strong></div><div class="row"><span>Expiring Date:</span><strong>Hutolewa baada ya idhini</strong></div><div class="row"><span>Principal/Branch:</span><strong id="pv-branch">—</strong></div></div>
      <div class="p-section"><h3>BUSINESS LOCATION / ENEO LA BIASHARA</h3><div class="row"><span>Region / Mkoa:</span><strong id="pv-region">—</strong></div><div class="row"><span>Halmashauri/Wilaya:</span><strong id="pv-district">—</strong></div><div class="row"><span>Ward / Kata:</span><strong id="pv-ward">—</strong></div><div class="row"><span>Street / Mtaa-Kijiji:</span><strong id="pv-street">—</strong></div></div>
      <div class="p-section"><h3>PAYMENT DETAILS</h3><div class="row"><span>Amount of Fee Paid:</span><strong>Haijathibitishwa - si risiti</strong></div><div class="row"><span>Makadirio ya ada:</span><strong id="pv-fee">Haijawekwa</strong></div></div>
      <div class="stamp">Hakuna namba rasmi, tarehe za uhalali au QR ya uthibitisho kwenye rasimu.</div>
      <div class="foot"><strong>RASIMU YA OMBI PEKEE — SI LESENI WALA RISITI YA MALIPO</strong>Wasilisha kwa mamlaka husika kwa ukaguzi, malipo na idhini.</div>
    </div></aside>
  </div>
</div>
<script>
const locationOptions = <?= $locationJson ?: '{}' ?>;
const form = document.querySelector('form');
const field = (name) => form.elements.namedItem(name);
const regionSelect = document.getElementById('region');
const districtSelect = document.getElementById('district');
const wardSelect = document.getElementById('ward');
const currentDistrict = <?= json_encode($form['district'], JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>;
const currentWard = <?= json_encode($form['ward'], JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>;
function setOptions(select, values, placeholder, chosen = '') {
  select.replaceChildren(new Option(placeholder, ''));
  values.forEach((value) => select.add(new Option(value, value, false, value === chosen)));
}
function updateDistricts(chosen = '') {
  const districts = Object.keys(locationOptions[regionSelect.value]?.districts || {});
  setOptions(districtSelect, districts, 'Chagua Halmashauri/Wilaya', chosen);
  updateWards(chosen ? currentWard : '');
}
function updateWards(chosen = '') {
  const wards = locationOptions[regionSelect.value]?.districts?.[districtSelect.value] || [];
  setOptions(wardSelect, wards, 'Chagua Kata', chosen);
}
regionSelect.addEventListener('change', () => updateDistricts());
districtSelect.addEventListener('change', () => updateWards());
if (regionSelect.value) updateDistricts(currentDistrict);
const text = (name) => field(name)?.value?.trim() || '—';
function updatePreview() {
  document.getElementById('pv-name').textContent = [text('firstName'), text('middleName'), text('lastName')].filter((v) => v !== '—').join(' ').toUpperCase() || '—';
  document.getElementById('pv-tin').textContent = text('tin');
  const type = text('businessType');
  document.getElementById('pv-type').textContent = type === 'OTHER' ? text('otherBusinessType') : type;
  document.getElementById('pv-app').textContent = text('applicationType');
  document.getElementById('pv-branch').textContent = text('principalBranch');
  document.getElementById('pv-region').textContent = text('region');
  document.getElementById('pv-district').textContent = text('district');
  document.getElementById('pv-ward').textContent = text('ward');
  document.getElementById('pv-street').textContent = text('street');
  const fee = text('estimatedFee');
  document.getElementById('pv-fee').textContent = fee === '—' ? 'Haijawekwa' : Number(fee).toLocaleString('en-TZ', {minimumFractionDigits: 2}) + ' TZS · makadirio';
}
form.addEventListener('input', updatePreview);
form.addEventListener('change', updatePreview);
field('businessType').addEventListener('change', (event) => { document.getElementById('other-wrap').hidden = event.target.value !== 'OTHER'; });
field('tin').addEventListener('input', (event) => {
  const digits = event.target.value.replace(/\D/g, '').slice(0, 9);
  event.target.value = digits.replace(/(\d{3})(?=\d)/g, '$1-');
  updatePreview();
});
updatePreview();
</script>
</body>
</html>
