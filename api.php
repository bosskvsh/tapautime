<?php
// ==============================================================================
// Tapau Time - Cross-Subdomain Synchronizer (Hostinger PHP Backend)
// ==============================================================================

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0777, true);
}

$action = $_GET['action'] ?? '';
$merchantId = preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['merchant'] ?? '');

if ($action === 'save_customization' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    if ($input && $merchantId) {
        file_put_contents($dataDir . '/customization_' . $merchantId . '.json', $input);
        echo json_encode(['status' => 'success']);
        exit;
    }
}

if ($action === 'get_customization') {
    $file = $dataDir . '/customization_' . $merchantId . '.json';
    if (file_exists($file)) {
        echo file_get_contents($file);
    } else {
        echo json_encode(null);
    }
    exit;
}

if ($action === 'save_menu' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    if ($input) {
        file_put_contents($dataDir . '/menu_' . $merchantId . '.json', $input);
        echo json_encode(['status' => 'success']);
        exit;
    }
}

if ($action === 'get_menu') {
    $file = $dataDir . '/menu_' . $merchantId . '.json';
    if (file_exists($file)) {
        echo file_get_contents($file);
    } else {
        echo json_encode(null);
    }
    exit;
}

echo json_encode(['status' => 'ok']);
