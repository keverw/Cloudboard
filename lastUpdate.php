<?php
//this gives the client when the last update was to a user's items
require(".config.php");
require("master.php");
require("db.php");

if (!headers_sent()) {
    header('Access-Control-Allow-Origin: *');
}

if (isset($_GET['token'])) {
    $db = db::instance();
    $_GET['token'] = str_replace(" ", "+", $_GET['token']);
    if (($user = $db->authExists($_GET['token'])) !== false) {
        if (isset($_GET['callback'])) {
            header("Content-type: application/javascript; charset=utf-8");
            $time = $_GET['callback'] . "(" . $db->getUpdatedTime($user) . ")";            
        } else {
            $time = $db->getUpdatedTime($user);
        }
        echo $time;
        exit(0);
        
    } else {
        die("invalid_token");
    }
} else {
    die("invalid_token");
}
?>