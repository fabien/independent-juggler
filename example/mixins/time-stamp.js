module.exports = function(Model, options) {
    
    Model.defineProperty('createdAt', { type: 'date', default: '$now' });
    Model.defineProperty('updatedAt', { type: 'date', default: '$now' });
    
    Model.observe('before save', function(ctx, next) {
        if (ctx.currentInstance) {
            ctx.data = ctx.data || {};
            ctx.data.updatedAt = new Date();
        }
        next();
    });
    
};