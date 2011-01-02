<?php

//this file is obsolete

ob_implicit_flush(true);

//this is the inbox for versions >=0.6
require(".config.php");
require("master.php");
require("db.php");

if (!headers_sent()) {
    header('Access-Control-Allow-Origin: *');
}

function shutdown(){
    file_put_contents("/tmp/phplog", "0", FILE_APPEND);
}

file_put_contents("/tmp/phplog", "-", FILE_APPEND);

register_shutdown_function("shutdown");

//begin testing
$x = 0;
while (true) {
    sleep(1);
    $x++;
    //somehow this combination of flushes gets php to check the connection status.
    ob_end_flush();
    flush();
    ob_end_clean();
    if(connection_status() != CONNECTION_NORMAL)
    {
        exit(0);
    } else {
        
    }
    if ($x > 30) {
        exit(0);
    }
}

//begin normal script
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
        
        echo "-"; //start output
        ob_end_flush();
        flush();
        ob_end_clean();
        $db->subscribe($user, 'gotItem');
        
    } else {
        postInvalidToken();
    }
} else {
    postInvalidToken();
}
?>