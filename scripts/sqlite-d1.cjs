/* D1-compatible test adapter backed by actual SQLite, not a mock room store. */
exports.sqliteD1=db=>{
 const api={
  withSession(){return api},
  prepare(sql){
   return {bind(...args){return {
    async first(){return db.prepare(sql).get(...args)||null},
    async all(){return {results:db.prepare(sql).all(...args)}},
    async run(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}}}
   }}}
  }
 };
 return api;
};
