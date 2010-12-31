<?php

/*
YOU MUST HAVE phpredis INSTALLED
*/

class db {
    
    private static $instance;
    private $redis;
    private $keysBackup;
    private $types;
    
    const USER_ITEM_LIMIT = 10;
    
    const TIMEOUT_ITEM = 36000; //10 hours
    const ITEM_KEY = "i:%u:%u"; //userid then itemid
    const ITEM_SEARCH_KEY = "i:%u:*";
    const ITEM_STATS_KEY = "i:%s:*"; //the middle %s will be replaced with *
    const ITEM_USER_IDS = "u:%u:ids";
    const ITEM_USER_STATS_IDS = "u:%s:ids"; //the middle %s will be replaced with *
    const USER_ITEMS_LIST = "u:%u:is";
    const USER_AUTH_KEY = "a:%s:%u"; //auth then userID
    const USER_AUTH_SEARCH_KEY = "a:%s:*";
    const USERS_SET = "l:users";
    const USER_IDS_KEY = "u:ids";
    
    //need to move to stored sets once we can get EXPIREs on them
    
    function __construct($host='127.0.0.1', $port='6440', $pass="", $db=0) {
        //little hack in case we want to send host/port/etc
        if (!self::$instance) {
            self::$instance =& $this;
        }
        
        $this->types = array('txt'=>1, 'lnk'=>2, 'img'=>3, 'pg'=>4, 'tab'=>5, 'ses'=>6);
        
        $this->keysBackup = array();
        
        $this->redis = new Redis();
        try {
            if ($this->connect($host, $port)) {
                if ($pass) {
                    if ($this->auth($pass)) {
                        
                    }
                }
                if ($db) {
                    $this->select($db);
                }
            }
        } catch(Exception $e) {
            throw $e;
        }
    }
    
    static function instance() {
        if (!isset(self::$instance)) {
            $class = __CLASS__;
            self::$instance = new $class;
        }        
        return self::$instance;
    }
    
    private function connect($host, $port) {
        try {
            if ($this->redis->connect($host, $port)) {
                return true;
            } else {
                $this->redis = null;
                throw new apiException("Could not connect to DB.");
            }
        } catch (RedisException $e) {
            $this->redis = null;
            throw $e;
        }
    }
    
    private function select($db) {
        try {
            if ($this->redis->select($db)) {
                return true;
            } else {
                $this->redis = null;
                throw new apiException("Could not connect to DB.");
            }
        } catch (RedisException $e) {
            $this->redis = null;
            throw $e;
        }
    }
    
    private function auth($pass) {
        try {
            if ($this->redis->auth($pass)) {
                return true;
            } else {
                $this->redis = null;
                throw new apiException("Invalid DB authorization.");
            }
        } catch (RedisException $e) {
            $this->redis = null;
            throw $e;
        }
    }
    
    //returns userID
    public function authExists($auth) {
        if ($this->redis && $auth) {
            try {
                $keys = $this->redis->getKeys(sprintf(self::USER_AUTH_SEARCH_KEY, $auth));
                if ($keys) {
                    return $this->redis->get($keys[0]);
                }
            } catch (Exception $e) {
                return false;
            }
        }
        return false;
    }
    
    public function getUser($email) {
        if ($this->redis && $email) {
            try {
                return $this->redis->zscore(self::USERS_SET, $email);
            } catch (Exception $e) {
                return false;
            }
        }
        return false;
    }
    
    public function getUserAuth($userid) {
        if ($this->redis && $userid) {
            try {
                $keys = $this->redis->getKeys(sprintf(self::USER_AUTH_KEY, "*", $userid));
                if ($keys) {
                    $parts = explode(":", $keys[0]);
                    return $parts[1];
                }
            } catch (Exception $e) {
                return false;
            }
        }
        return false;
    }
    
    //returns userID
    public function addUser($auth, $email) {
        if ($this->redis && $auth && $email) {
            try {
                if (!$this->redis->zscore(self::USERS_SET, $email)) {
                    $userID = $this->redis->incr(self::USER_IDS_KEY);                    
                    if ($userID) {
                        $this->redis->zadd(self::USERS_SET, $userID, $email);
                        return $this->redis->set(sprintf(self::USER_AUTH_KEY, $auth, $userID), $userID);
                    }
                }
            } catch (Exception $e) {
                return false;
            }
        }
        return false;
    }
    
    //old
    public function addItem($user, $text) {
        if ($this->redis) {
            try {
                if ($user && $text && !isset($text[8192])) { //no more than 8192 chars
                    $itemID = $this->redis->incr(sprintf(self::ITEM_USER_IDS, $user));
                    if ($itemID) {
                        if ($this->redis->set(sprintf(self::ITEM_KEY, $user, $itemID), (string)$text, self::TIMEOUT_ITEM)) {
                            if ($this->getItemKeys($user, true) && 
                                count($this->keysBackup[$user]) > self::USER_ITEM_LIMIT) {
                                $this->redis->delete(array_pop($this->keysBackup[$user]));
                                
                            }
                            return $itemID;
                        }
                    }
                }                
            } catch (Exception $e) {
                return false;
            }
        }
        return false;
    }
    
    //new
    public function addItemEx($user, $text, $type='txt') {
        if ($this->redis) {
            try {
                if ($user && $text && !isset($text[8192])) { //no more than 8192 chars
                    //determine type id
                    if (isset($this->types[$type])) {
                        $typeId = $this->types[$type];
                    } else {
                        $typeId = $this->types['txt'];
                    }
                    $itemID = $this->redis->incr(sprintf(self::ITEM_USER_IDS, $user));
                    if ($itemID) {
                        if ($this->redis->set(sprintf(self::ITEM_KEY, $user, $itemID), (string)$text.":".$typeId, self::TIMEOUT_ITEM)) {
                            if ($this->getItemKeys($user, true) && 
                                count($this->keysBackup[$user]) > self::USER_ITEM_LIMIT) {
                                $this->redis->delete(array_pop($this->keysBackup[$user]));
                                
                            }
                            return $itemID;
                        }
                    }
                }                
            } catch (Exception $e) {
                return false;
            }
        }
        return false;
    }
    
    //old
    public function checkForDup($user, $text) {
        if ($this->redis) {
            try {
                $keys = $this->getItemKeys($user);
                if ($keys) {
                    foreach($keys as $k) {
                        if ($text == (string)$this->redis->get($k)) {
                            return false;
                        }
                    }         
                }
                return true;
            } catch (Exception $e) {
                return false;
            }
        }
        return false;
    }
    
    public function checkForDupEx($user, $text, $type="txt") {
        if ($this->redis) {
            try {
                $keys = $this->getItemKeys($user);
                //determine type id
                if (isset($this->types[$type])) {
                    $typeId = $this->types[$type];
                } else {
                    $typeId = $this->types['txt'];
                }
                if ($keys) {
                    foreach($keys as $i => $k) {
                        if ((string)$text.":".$typeId == (string)$this->redis->get($k)) {
                            //need to make a new one to bring it to the top
                            if ($i>0) { //make sure we aren't already at the top
                                $this->redis->delete($k);
                                $this->addItemEx($user, $text, $type);
                            }
                            return false;
                        }
                    }         
                }
                return true;
            } catch (Exception $e) {
                return false;
            }
        }
        return false;
    }
    
    public function getItemKeys($user, $force=false) {
        if ($this->redis) {
            try {
                if (!isset($this->keysBackup[$user]) || $force) {
                    $this->keysBackup[$user] = $this->redis->getKeys(sprintf(self::ITEM_SEARCH_KEY, $user));
                    rsort($this->keysBackup[$user]);
                }
                return $this->keysBackup[$user];
            } catch (Exception $e) {
                return false;
            }
        }
        return false;
    }
    
    //need to send a newformat param to know if we have part type or not
    public function getItems($user, $newformat=false) {
        if ($this->redis) {
            try {
                $items = array();
                $keys = $this->getItemKeys($user);
                if ($keys) {
                    foreach($keys as $k) {
                        $itemParts = explode(":", $k); //get the id                        
                        if ($newformat) {
                            $item = (string)$this->redis->get($k);
                            if (($split = strripos($item, ":")) > 0 && strlen($item)-$split<=3) { $itemTextParts = str_split($item, $split); } else { $itemTextParts = array($item); } //split string at last :
                            if (isset($itemTextParts[1])) {
                                $type = array_search(substr($itemTextParts[1], 1), $this->types); //remove the :
                                if (!$type) { $type = "txt"; }
                            } else {
                                $type = "txt";
                            }
                            $items[] = array('text'=>$itemTextParts[0], 'type'=>'txt', 'id'=>$itemParts[2]);
                        } else {
                            $items[] = (string)$this->redis->get($k);
                        }
                    }
                    //krsort($items);         
                }
                return $items;
            } catch (Exception $e) {
                return false;
            }
        }
        return false;
    }
    
    public function getUpdatedTime($user) {
        if ($this->redis) {
            try {
                $items = array();
                $keys = $this->getItemKeys($user);
                if ($keys) {
                    $ttl = $this->redis->ttl($keys[0]);
                    $updatedTime = time()-(self::TIMEOUT_ITEM - $ttl);
                    return $updatedTime;
                }
                return time();
            } catch (Exception $e) {
                return 0;
            }
        }
        return 0;
    }
    
    //stats
    public function getStats() {
        if ($this->redis) {
            $stats = array();
            try {
                $idsKeys = $this->redis->getKeys(sprintf(self::ITEM_USER_STATS_IDS, "*"));
                $items = 0;
                $aUsers = 0;
                $aItems = 0;
                if ($idsKeys) {
                    $idsValues = $this->redis->getMultiple($idsKeys);                    
                    foreach($idsKeys as $i => $n) {
                        $items += $idsValues[$i];
                        if ($idsValues[$i] > 0) {
                            list($u) = sscanf($n, self::ITEM_USER_STATS_IDS);
                            list($u) = explode(":", $u);
                            if (($cnt = $this->getItemKeys($u))) {
                                $aUsers++;
                                $aItems += count($cnt);
                            }
                        }
                    }
                }
                $stats['totalItems'] = $items;
                $stats['users'] = count($idsKeys);
                $stats['activeUsers'] = $aUsers; //if they have ANY shared items right now, might not be completely accurate
                $stats['activeItems'] = $aItems;
                return $stats;
            } catch (Exception $e) {
                return array();
            }
        }
        return array();
    }
    
}

?>