<?php
//this is the inbox for versions >=0.6
require(".config.php");
require("master.php");
require("db.php");

set_time_limit(5); //this doesn't do shit
ob_implicit_flush(true);

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
        
        function gotItem($item, $db, $user) {
            if (isset($_GET['callback'])) {
                header("Content-type: application/javascript; charset=utf-8");
                $output = $_GET['callback'] . "(" . json_encode($item) . ")";
            } else {
                header("Content-type: application/json; charset=utf-8");
                $output = json_encode($item);
            }
            echo $output;
            //$db->unsubscribe($user); //run this last, we don't know what it will do
            exit(0);
        }
        $db->subscribe($user, 'gotItem');        
        
    } else {
        postInvalidToken();
    }
} else {
    postInvalidToken();
}
?>