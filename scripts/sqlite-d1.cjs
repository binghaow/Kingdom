/* D1-compatible test adapter backed by actual SQLite, not a mock room store. batch() runs its statements in one
   transaction and returns one {results} per statement, like D1's batch (used by the P3 lockstep relay). */
exports.sqliteD1=db=>{
 const api={
  withSession(){return api},
  prepare(sql){
   return {bind(...args){return {
    async first(){return db.prepare(sql).get(...args)||null},
    async all(){return {results:db.prepare(sql).all(...args)}},
    async run(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}}},
    _sync(){return {results:db.prepare(sql).all(...args)}}
   }}}
  },
  async batch(list){db.exec('BEGIN IMMEDIATE');try{const out=list.map(s=>s._sync());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}
 };
 return api;
};
