var path = require('path');
var fs = require('fs');
var _ = require('lodash');
var async = require('async');

var Registry = function(juggler, options) {
    this.dataSources = {};
    this.juggler = juggler;
    this.modelBuilder = new juggler.ModelBuilder();
    options = _.extend({}, options);
    
    var rootDir = options.dir || process.cwd();
    var configDir = options.configDir || path.join(rootDir, 'config');
    var modelsDir = options.modelsDir || path.join(rootDir, 'models');
    var mixinsDir = options.mixinsDir || path.join(rootDir, 'mixins');
    var env = options.env || process.env.NODE_ENV || 'development';
    
    var datasourceConfig = _.extend({}, options.datasources);
    var modelConfig = this.modelConfig = _.extend({}, options.models);
    
    var datasourceConfigs = findConfigFiles(configDir, env, 'datasources');
    mergeConfigFiles(datasourceConfig, datasourceConfigs);
    
    var modelConfigs = findConfigFiles(configDir, env, 'model-config');
    
    var resolved = mergeConfigFiles(modelConfig, modelConfigs);
    
    var modelSources = [modelsDir].concat(resolved.models);
    var mixinSources = [mixinsDir].concat(resolved.mixins);
    
    _.each(datasourceConfig, function(config, name) {
        config = config || {};
        this.dataSources[config.name || name] = this.createDataSource(name, config);
    }.bind(this));
    
    this.modelDefinitions = this.loadModelDefinitions(modelSources);
    this.loadMixinDefinitions(mixinSources);
};

Registry.prototype.connect = function(callback) {
    if (this.models) return callback && callback(err, this.models);
    
    if (_.isEmpty(this.dataSources)) throw new Error('No DataSources configured');
    if (_.isEmpty(this.modelConfig)) throw new Error('No Models configured');
    
    var dataSources = _.groupBy(this.modelDefinitions, 'dataSource');
    var models = this.models = {};
    _.each(dataSources, function(definitions, dataSource) {
        var schemas = _.pluck(definitions, 'definition');
        _.extend(models, this.defineModels(dataSource, schemas));
    }.bind(this));
    
    var attachModel = this.attachModel.bind(this);
    var applySourceFile = this.applySourceFile.bind(this);
    var finalizeModel = this.finalizeModel.bind(this);
    
    async.each(_.values(this.dataSources), function(ds, next) {
        ds.connect(next);
    }.bind(this), function(err) {
        _.each(models, applySourceFile);
        _.each(models, attachModel);
        _.each(models, finalizeModel);
        callback && callback(err, models);
    });
};

Registry.prototype.disconnect = function(callback) {
    var dataSources = this.dataSources;
    async.each(_.keys(dataSources), function(name, next) {
        dataSources[name].disconnect(next);
    }, function(err) {
        var models = this.models;
        delete this.models;
        callback && callback(err, models);
    }.bind(this));
};

Registry.prototype.setupDataSource = function(name, options) {
    this.dataSources[name] = this.createDataSource(name, options);
    return this.dataSources[name];
};

Registry.prototype.createDataSource = function(name, options) {
    var DataSource = this.juggler.DataSource;
    return new DataSource(name, options, this.modelBuilder);
};

Registry.prototype.loadModelDefinitions = function(sourcePaths) {
    var modelConfig = this.modelConfig || {};
    var modelDefinitions = {};
    var props = ['name', 'properties', 'options'];
    _.each(sourcePaths, function(sourceDir) {
        var files = tryReadDir(sourceDir);
        _.each(files, function(filename) {
            var filepath = path.join(sourceDir, filename);
            var ext = path.extname(filename);
            var name = path.basename(filename, ext);
            if (ext === '.json') {
                var config = require(filepath);
                var definition = _.pick(config, props);
                definition.options = _.extend({}, definition.options, _.omit(config, props));
                modelDefinitions[name] = modelDefinitions[name] || {};
                modelDefinitions[name].definition = definition;
                var modelName = definition.name || classify(name);
                modelDefinitions[name].name = definition.name || classify(name);
                modelDefinitions[name].load = _.isObject(modelConfig[modelName]);
                if (modelDefinitions[name].load && modelConfig[modelName].dataSource) {
                    modelDefinitions[name].dataSource = modelConfig[modelName].dataSource;
                }
            } else if (ext === '.js') {
                modelDefinitions[name] = modelDefinitions[name] || {};
                modelDefinitions[name].sourceFile = filepath;
            }
        });
    });
    var models = {};
    _.each(modelDefinitions, function(definition) {
        if (definition.load) models[definition.name] = definition;
    });
    return models;
};

Registry.prototype.loadMixinDefinitions = function(sourcePaths) {
    var modelBuilder = this.modelBuilder;
    _.each(sourcePaths, function(sourceDir) {
        var files = tryReadDir(sourceDir);
        _.each(files, function(filename) {
            var filepath = path.join(sourceDir, filename);
            var ext = path.extname(filename);
            if (ext === '.js') {
                var name = classify(path.basename(filename, ext));
                var fn = require(filepath);
                if (_.isFunction(fn)) {
                    modelBuilder.mixins.define(name, fn);
                }
            }
        });
    });
};

Registry.prototype.defineModels = function(dataSource, schemas) {
    var ds = _.isString(dataSource) ? this.dataSources[dataSource] : dataSource;
    return ds.modelBuilder.buildModels(schemas);
};

Registry.prototype.attachModel = function(modelClass) {
    var definition = this.modelDefinitions[modelClass.modelName];
    if (definition) {
        var dataSource = definition.dataSource || 'db';
        var ds = this.dataSources[dataSource];
        if (!ds) return console.warn('WARNING: Invalid DataSource: ', dataSource);
        ds.attach(modelClass);
    }
};

Registry.prototype.applySourceFile = function(modelClass) {
    var definition = this.modelDefinitions[modelClass.modelName]
    if (definition) {
        if (definition.sourceFile && fs.existsSync(definition.sourceFile)) {
            var fn = require(definition.sourceFile);
            if (_.isFunction(fn)) fn.call(this, modelClass);
        }
    }
};

Registry.prototype.finalizeModel = function(modelClass) {
    modelClass.emit('attached', this);
    modelClass.emit('boot', this);
};

module.exports = Registry;

function classify(string) {
    return _.startCase(string + '').replace(/\s/g, '');
};

function findConfigFiles(configDir, env, name) {
    var master = ifExists(name + '.json');
    if (!master && (ifExistsWithAnyExt(name + '.local') ||
        ifExistsWithAnyExt(name + '.' + env))) {
        console.warn('WARNING: Main config file "' + name + '.json" is missing');
    }
    if (!master) return [];
    
    var candidates = [
        master,
        ifExistsWithAnyExt(name + '.local'),
        ifExistsWithAnyExt(name + '.' + env)
    ];
    
    return candidates.filter(function(c) { return c !== undefined; });
    
    function ifExists(fileName) {
        var filepath = path.resolve(configDir, fileName);
        return fs.existsSync(filepath) ? filepath : undefined;
    }
    
    function ifExistsWithAnyExt(fileName) {
        return ifExists(fileName + '.js') || ifExists(fileName + '.json');
    }
};

function loadConfigFiles(files) {
    return files.map(function(f) {
        var config = require(f);
        Object.defineProperty(config, '_filename', {
            enumerable: false, value: f
        });
        return config;
    });
};

function mergeConfigFiles(config, files) {
    var modelSources = [];
    var mixinSources = [];
    _.each(loadConfigFiles(files), function(c) {
        if (!_.isObject(c)) return;
        var dirname = path.dirname(c._filename);
        if (_.isObject(c._meta) && _.isArray(c._meta.sources)) {
            var resolvedModels = resolveSources(dirname, c._meta.sources);
            modelSources = modelSources.concat(resolvedModels);
        }
        if (_.isObject(c._meta) && _.isArray(c._meta.mixins)) {
            var resolvedMixins = resolveSources(dirname, c._meta.mixins);
            mixinSources = mixinSources.concat(resolvedMixins);
        }
        _.merge(config, _.omit(c, '_meta'));
    });
    return { models: modelSources, mixins: mixinSources };
};

function resolveSources(dirname, sources) {
    return _.map(sources, function(src) {
        if (_.isString(src) && src.indexOf('.') === 0) {
            return path.resolve(dirname, src);
        } else {
            return src;
        }
    });
};

function tryReadDir() {
    try {
        return fs.readdirSync.apply(fs, arguments);
    } catch (e) {
        return [];
    }
};
