<?php
// Adding a customer or converting a lead needs the approved quotation and the total plant cost (api/onboard.php); only an admin's bulk
// tools may skip them. onb($who, $m, $a, $fields) is call() sent as a form with a small quotation PDF and a plant cost — for the tests
// where staff (not the admin) add customers. Needs the including test's $base and an actor with a cookie 'jar'.
function onb($who, $m, $a, $fields = [], $cost = 250000, $extra = []) {
  global $base;
  $p = sys_get_temp_dir() . '/onb_' . bin2hex(random_bytes(5)) . '.pdf';
  file_put_contents($p, "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  $ch = curl_init("$base/api.php?m=$m&a=$a");
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar'], CURLOPT_POST => true, CURLOPT_HTTPHEADER => ['X-Solarize: 1'],
    CURLOPT_POSTFIELDS => $extra + $fields + ['plant_cost' => $cost, 'quote' => new CURLFile($p, 'application/pdf', 'approved-quotation.pdf')]]);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch); @unlink($p);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = ['_text' => $txt];
  $j['_code'] = $code; return $j;
}
