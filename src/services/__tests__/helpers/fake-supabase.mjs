/**
 * In-memory Supabase stand-in shared by persistence tests and the module mocks.
 * Updates replace stored JSON the way a real jsonb column write does.
 */

const tables = {
  analyses: [],
  pull_requests: [],
  analysis_findings: [],
  analysis_changed_files: [],
  affected_areas: [],
  analysis_events: [],
  risk_factors: [],
  tasks: [],
};

const control = {
  analysesPointReads: 0,
  /** 1-based analyses maybeSingle/single call to fail. 0 means none. */
  failAnalysesPointReadCall: 0,
  /**
   * Failure for that read. A string is a database error. null means the
   * read succeeds with no row.
   */
  failAnalysesPointReadMessage: undefined,
  failAnalysesUpdateMessage: null,
  /** Analyses updates match nothing and do not change stored rows. */
  zeroRowAnalysesUpdate: false,
  /** Delete rejects with this message instead of removing rows. */
  failDeleteMessage: null,
  rpcError: null,
};

const mutations = [];
const rpcCalls = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function resetStore() {
  for (const key of Object.keys(tables)) tables[key] = [];
  control.analysesPointReads = 0;
  control.failAnalysesPointReadCall = 0;
  control.failAnalysesPointReadMessage = undefined;
  control.failAnalysesUpdateMessage = null;
  control.zeroRowAnalysesUpdate = false;
  control.failDeleteMessage = null;
  control.rpcError = null;
  mutations.length = 0;
  rpcCalls.length = 0;
}

/** Fail the Nth analyses maybeSingle/single. message null means "no row". */
export function failAnalysesPointRead(callNumber, message) {
  control.failAnalysesPointReadCall = callNumber;
  control.failAnalysesPointReadMessage = message;
}

export function failAnalysesUpdate(message) {
  control.failAnalysesUpdateMessage = message;
}

export function setZeroRowAnalysesUpdate(enabled = true) {
  control.zeroRowAnalysesUpdate = enabled;
}

export function failDeletes(message) {
  control.failDeleteMessage = message;
}

export function setRpcError(message) {
  control.rpcError = message;
}

export function getMutations() {
  return mutations.slice();
}

export function getRpcCalls() {
  return rpcCalls.slice();
}

export function getStore() {
  return tables;
}

function matches(row, filters) {
  return filters.every((filter) => {
    const value = row[filter.column];
    if (filter.op === "in") return filter.value.includes(value);
    return value === filter.value;
  });
}

class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.operation = "select";
    this.payload = null;
    this.orderBy = null;
    this.limitCount = null;
    this.returning = false;
    this.returnColumns = null;
  }

  select(columns) {
    this.returning = true;
    this.returnColumns = typeof columns === "string" ? columns : null;
    return this;
  }

  eq(column, value) {
    this.filters.push({ op: "eq", column, value });
    return this;
  }

  in(column, value) {
    this.filters.push({ op: "in", column, value });
    return this;
  }

  order(column, options = {}) {
    this.orderBy = { column, ascending: options.ascending !== false };
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  insert(payload) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.#run(true));
  }

  single() {
    return Promise.resolve(this.#run(true));
  }

  then(resolve, reject) {
    return Promise.resolve(this.#run(false)).then(resolve, reject);
  }

  #rows() {
    if (!Object.prototype.hasOwnProperty.call(tables, this.table)) {
      throw new Error(`Unexpected table ${this.table}`);
    }
    return tables[this.table];
  }

  #run(single) {
    const rows = this.#rows();
    if (this.operation === "insert") {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload];
      for (const row of incoming) rows.push(clone(row));
      return { data: null, error: null };
    }

    let matched = rows.filter((row) => matches(row, this.filters));
    if (
      this.operation === "update" &&
      this.table === "analyses" &&
      control.zeroRowAnalysesUpdate
    ) {
      matched = [];
    }

    if (this.operation === "update") {
      mutations.push({ op: "update", table: this.table });
      if (this.table === "analyses" && control.failAnalysesUpdateMessage) {
        return { data: null, error: { message: control.failAnalysesUpdateMessage } };
      }
      const next = clone(this.payload);
      for (const row of matched) Object.assign(row, next);
      if (!this.returning) {
        return { data: null, error: null };
      }
      const projected = matched.map((row) =>
        this.returnColumns === "id" ? { id: row.id } : clone(row),
      );
      if (single) {
        return { data: projected[0] ?? null, error: null };
      }
      return { data: projected, error: null };
    }

    if (this.operation === "delete") {
      if (control.failDeleteMessage) {
        throw new Error(control.failDeleteMessage);
      }
      tables[this.table] = rows.filter((row) => !matches(row, this.filters));
      return { data: null, error: null };
    }

    let selected = matched.map((row) => clone(row));
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      selected.sort((a, b) => {
        const av = a[column];
        const bv = b[column];
        if (av === bv) return 0;
        if (av > bv) return ascending ? 1 : -1;
        return ascending ? -1 : 1;
      });
    }
    if (this.limitCount != null) selected = selected.slice(0, this.limitCount);
    if (single) {
      if (this.table === "analyses") {
        control.analysesPointReads += 1;
        if (control.analysesPointReads === control.failAnalysesPointReadCall) {
          if (control.failAnalysesPointReadMessage) {
            return {
              data: null,
              error: { message: control.failAnalysesPointReadMessage },
            };
          }
          return { data: null, error: null };
        }
      }
      return { data: selected[0] ?? null, error: null };
    }
    return { data: selected, error: null };
  }
}

export function createFakeClient() {
  return {
    from(table) {
      return new Query(table);
    },
    rpc(fn, args) {
      rpcCalls.push({ fn, args: clone(args) });
      if (control.rpcError) {
        return Promise.resolve({ data: null, error: { message: control.rpcError } });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}
