module.exports = function(Book) {
    console.log('Setup:', Book.modelName);
    
    Book.defineProperty('publishedAt', { type: 'date', default: '$now' });
    
    Book.on('attached', function() {
        console.log('Attached:', Book.modelName);
        Book.mixin('TimeStamp');
    });
};