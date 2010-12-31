<?php
//this gives the client when the last update was to a user's items
require(".config.php");
require("master.php");
require("db.php");

if (!headers_sent()) {
    header('Access-Control-Allow-Origin: *');
}

function postInvalidToken() {
    if (isset($_GET['post'])) {
        die("invalid_token");
    } else {
        die("Invalid Token");
    }
}

if (isset($_GET['token'])) {
    $db = db::instance();
    $_GET['token'] = str_replace(" ", "+", $_GET['token']);
    if (($user = $db->authExists($_GET['token'])) !== false) {
        if (isset($_GET['callback'])) {
            header("Content-type: application/javascript; charset=utf-8");
            die($_GET['callback'] . "(" . $db->getUpdatedTime($user) . ")");
        } else {
            die($db->getUpdatedTime($user));
        }
        
    } else {
        postInvalidToken();
    }
} else {
    postInvalidToken();
}
?>