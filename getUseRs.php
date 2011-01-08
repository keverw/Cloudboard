<?php
//used to rebuild the user file
require(".config.php");
require("master.php");
require("db.php");

/*
$db = db::instance();
$users = $db->getUsers();
ksort($users);
$userString = "";
foreach($users AS $u => $auth) {
    $userString .= $u.":".$auth."\n";
}
var_dump(file_put_contents(USERFILE, $userString));*/
?>