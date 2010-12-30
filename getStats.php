<?php

require(".config.php");
require("db.php");

$db = db::instance();
var_dump($db->getStats());

?>