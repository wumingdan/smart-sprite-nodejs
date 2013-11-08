
var fs = require('fs');

var PNG = require('pngjs').PNG;

var utilHelper = require('./util-helper');

var imageInfoCache = {};

var getImageSize = function (image, callback) {
    var size = 0;
    image.pack()
        .on('data', function (chunk) {
            size += chunk.length;
        })
        .on('end', function () {
            callback(size);
        });
}

var setImageWidthHeight = function (styleObj, imageInfo) {
    var w = 0, h = 0, mw = imageInfo.width, mh = imageInfo.height;
    for (var i = 0, rule; rule = styleObj.cssRules[i]; i++) {
        w = getPxValue(rule.width),
        h = getPxValue(rule.height);
        if (w > mw) {
            mw = w;
        }
        if (h > mh) {
            mh = h;
        }
    }

    // TODOTODOTODO margin!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    styleObj.w = mw + 10;
    styleObj.h = mh + 10;
}

var getPxValue = function (cssValue) {
    if (cssValue && cssValue.indexOf('px') > -1) {
        return parseInt(cssValue);
    }
    return 0;
}

exports.read = function (config, styleObjList, callback) {

    var result = styleObjList;


    utilHelper.forEach(result, function (url, styleObj, next) {
        var imageInfo, content, image, imageFileName;

        if (imageInfo = imageInfoCache[url]) {
            // 从所有style里面，选取图片宽高最大的作为图片宽高
            setImageWidthHeight(styleObj, imageInfo);

            styleObj.imageInfo = imageInfo;
            next();
        } else {
            imageFileName = config.input + url;

            imageInfo = {};

            fs.createReadStream(imageFileName)
                .pipe(new PNG())
                .on('parsed', function () {
                    imageInfo.image = this;
                    imageInfo.width = this.width;
                    imageInfo.height = this.height;
                    getImageSize(this, function (size) {
                        imageInfo.size = size;
                        imageInfoCache[url] = imageInfo;

                        // 从所有style里面，选取图片宽高最大的作为图片宽高
                        setImageWidthHeight(styleObj, imageInfo);

                        styleObj.imageInfo = imageInfo;

                        result[url] = styleObj;
                        
        console.log(styleObj)
        console.log('=========================')

                        next();
                    });
                });
        }

    }, function(){
        callback(result)
    });
}