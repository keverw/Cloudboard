<?php
//this accepts the posts in version >=0.6
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
        
        if (isset($_GET['type'])) {
            $type = $_GET['type'];
        } else {
            $type = "txt";
        }

        $text = file_get_contents("php://input");
        if ($db->checkForDupEx($user, $text, $type)) {
            if ($db->addItemEx($user, $text, $type)) {
                die("true");
            } else {
                die("false");
            }
        } else {
            die("dup");
        }
        
        
    } else {
        postInvalidToken();
    }
} else {
    postInvalidToken();
}
?>