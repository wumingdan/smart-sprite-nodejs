var util = require('util');
var crypto = require('crypto');

exports.is = function (type, obj) {
    var clazz = toString.call(obj).slice(8, -1);

    return obj !== undefined && obj !== null && clazz === type;
};

exports.isString = function (obj) {
    return toString.call(obj) === '[object String]';
};

exports.isObject = function (obj) {
    return toString.call(obj) === '[object Object]';
};

exports.jsonParse = function (jsonStr) {
    return Function('return ' + jsonStr)();
};

exports.forEach = function (array, onEach, onEnd) {
    var keys = null;
    if (!util.isArray(array)) {
        if (this.isObject(array)) {
            keys = [];
            for (var i in array) {
                if (array.hasOwnProperty(i)) {
                    keys.push(i);
                }
            }
        } else {
            throw new Error('not an array or a object');
        }
    }
    var index = -1, count = (keys || array).length;
    var next = function () {
        if (++index >= count) {
            onEnd && onEnd(count);
            return;
        }
        var key = keys ? keys[index] : index;
        onEach && onEach(key, array[key], next);
    };
    next();
};

exports.md5 = function(text){
    return crypto.createHash('md5').update(text).digest('hex');
};