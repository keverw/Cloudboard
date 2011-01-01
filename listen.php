<?php

ignore_user_abort(true); //we can disable this but for testing I want to see -
//set_time_limit(5); //this doesn't do shit
ob_implicit_flush(true);

//this is the inbox for versions >=0.6
require(".config.php");
require("master.php");
require("db.php");

if (!headers_sent()) {
    header('Access-Control-Allow-Origin: *');
}

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
        file_put_contents("/tmp/log.cb","-",FILE_APPEND);
        exit(0);
    } else {
        file_put_contents("/tmp/log.cb",connection_status(),FILE_APPEND);
    }
    if ($x > 15) {
        file_put_contents("/tmp/log.cb",5,FILE_APPEND);
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
        flush();
        ob_flush();
        //$db->subscribe($user, 'gotItem');
        
    } else {
        postInvalidToken();
    }
} else {
    postInvalidToken();
}
?>