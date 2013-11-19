
var fs = require('fs');
var path = require('path');

var PNG = require('pngjs').PNG;

var im = require('imagemagick');

var utilHelper = require('./util-helper');
var fileHelper = require('./file-helper');

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

var expandOnce = function (src, dest, type, expand, callback) {
    im.convert(
        [
            src,
            '-background', 'transparent',
            '-gravity', type,
            '-extent', expand,
            dest
        ],
        function (err, stdout) {
            if (err) {
                // TODO
                throw err;
            };

            callback();
        }
    );
};

exports.read = function (config, styleObjList, callback) {

    var result = styleObjList;

    utilHelper.forEach(result, function (token, styleObj, next) {
        var imageInfo, content, image, imageFileName;

        var url = styleObj.url;

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

                    result[token] = styleObj;

                    next();
                });
            });

    }, function () {
        callback(result)
    });
};

exports.expand = function (config, img, expands, callback) {
    var workingdir = config.workingdir
        || path.resolve((config.imageOutput || config.output), '/tmp/');

    var top = expands[0];
    var right = expands[1];
    var bottom = expands[2];
    var left = expands[3];

    var src = img.imgUrl;
    var align = img.align || 'left';    // TODO
    var width = img.width;
    var height = img.height;

    // http://www.imagemagick.org/Usage/crop/#extent
    var expandTop = width + 'x' + (height + top);
    var expandRight = (width + right) + 'x' + (height + top);
    var expandBottom = (width + right) + 'x' + (height + top + bottom);
    var expandLeft = (width + right + left) + 'x' + (height + top + bottom);

    debugger;

    if (!fs.existsSync(workingdir)) {
        fileHelper.mkdirsSync(workingdir);
    }

    var dest = path.resolve(workingdir, img.uuid + '.png');

    expandOnce(src, dest, 'south', expandTop, function () {
        expandOnce(dest, dest, 'west', expandRight, function () {
            expandOnce(dest, dest, 'north', expandBottom, function () {
                expandOnce(dest, dest, 'east', expandLeft, function () {
                    console.log('done expand');
                    callback();
                });
            });
        });
    });

};

exports.montage = function (imgs, output) {
    imgs.push('-background');
    imgs.push('transparent');
    imgs.push('-append');
    imgs.push(output);

    im.convert(imgs);
};

//this.expand({
//    'imgUrl': 'test/css/decorator/os_icons/ios.png',
//    width: 100,
//    height: 100
//    },
//[10, 10, 100, 10], function () { })