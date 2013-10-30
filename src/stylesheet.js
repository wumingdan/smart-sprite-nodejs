﻿


var fs = require('fs');
var path = require('path');
var util = require('util');

var cssom = require('cssom');

var utilHelper = require('./util-helper');
var fileHelper = require('./file-helper');

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

exports.write = function (spriteObjList, outputRoot) {
    if (!util.isArray(spriteObjList)) {
        spriteObjList = [spriteObjList];
    }

    var fileName, spriteObj, cssContentList = [];

    for (var i in spriteObjList) {
        spriteObj = spriteObjList[i];
        fileName = path.resolve(outputRoot + spriteObj.fileName);

        fileHelper.writeFileSync(fileName, styleSheetToString(spriteObj.styleSheet), true);
    }
}