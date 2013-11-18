


var fs = require('fs');
var readline = require('readline');
var path = require('path');
var util = require('util');

var cssom = require('cssom');

var utilHelper = require('./util-helper');
var fileHelper = require('./file-helper');

var spriteDefineReg = /\*+\s+(sprite:[^*]*)\*+/;
var spriteReferenceDirective = /\/\*+\s+sprite-ref:[\s\S]+\*\//;

var styleSheetToString = function (styleSheet) {
    var result = "";
    var rules = styleSheet.cssRules, rule;
    for (var i = 0; i < rules.length; i++) {
        rule = rules[i];
        if (rule instanceof cssom.CSSImportRule) {
            result += styleSheetToString(rule.styleSheet) + '\n';
        } else {
            result += rule.cssText + '\n';
        }
    }
    return result;
};

/**
 * Method for parsing SmartSprites directives string to Object
 */
var parseDirectives = function (directives) {
    var result = {};

    if (!directives) return result;

    // remove the comment 
    directives = directives.replace(/\/\*\*|\*\//g, '');

    var parts = directives.split(';');

    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];

        var chunks = part.split(':');

        if (chunks.length == 2) { 
            var key = chunks[0].trim();
            var value = chunks[1].trim();

            if (value.indexOf('${md5}') != -1) {
                var text = value.replace('${md5}', '');
                value = value.replace('${md5}', utilHelper.md5(text));
            }

            result[key] = value;
        }
        // TODO: else, warnning report
    };

    return result;
};

exports.read = function (filePath) {
    var content = fs.readFileSync(filePath);

    return content;
};

exports.getStyleSheet = function (filePath) {
    var content = this.read(filePath);

    var styleSheet = cssom.parse(content.toString());

    return styleSheet;
};

exports.getCssRules = function (filePath) {
    var styleSheet = this.getStyleSheet(filePath);

    return styleSheet.cssRules;
};

/**
 * Method for collecting SmartSprites directives from CSS files.
 * return: array of spriteImageNames
 */
exports.getSpriteDefinitions = function (filePath, callback) {
    var results = [];

    var rd = readline.createInterface({
        input: fs.createReadStream(filePath),
        output: process.stdout,
        terminal: false
    });

    rd.on('line', function (line) {
        if (spriteDefineReg.test(line)) {
            var result = parseDirectives(line);

            if (result && result['sprite-image'] != undefined) {
                var url = result['sprite-image'];

                var items;

                items = url.split('"');

                if (items.length != 3) {
                    items = url.split("'");
                }

                if (items.length != 3) {
                    console.warn('warn', 'sprite定义不正确');
                }

                result.__url = items[1].trim();
            }

            results.push(result);
        }
    });

    rd.on('close', function(){
        callback(results);
    });  
}

exports.getSpriteReferenceDirective = function (filePath, rule, callback) {
    var start = rule.__starts;
    var end = rule.__ends;
    var length = end - start;


    var readable = fs.createReadStream(filePath, { start: start, end: end });

    readable.on('data', function (chunk) {
        var cssRuleText = chunk.toString();
        var result;

        // parse /** sprite-ref: common;sprite-margin-bottom:20px;*/
        if (spriteReferenceDirective.test(cssRuleText)) {
            var comment = cssRuleText.match(spriteReferenceDirective)[0];

            result = parseDirectives(comment);
        }
        callback(result);
    });
};


exports.write = function (spriteObjList, outputRoot) {
    if (!util.isArray(spriteObjList)) {
        spriteObjList = [spriteObjList];
    }

    var fileName,
        spriteObj,
        cssContentList = [];

    for (var i in spriteObjList) {
        spriteObj = spriteObjList[i];
        fileName = path.resolve(outputRoot + spriteObj.fileName);

        fileHelper.writeFileSync(fileName, styleSheetToString(spriteObj.styleSheet), true);
    }
};