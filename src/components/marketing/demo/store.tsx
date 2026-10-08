"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import {
  DAY_MS,
  makeSeed,
  newId,
  platformsOf,
  type DemoApproval,
  type DemoClient,
  type DemoFilter,
  type DemoPost,
  type DemoView,
} from "./model";
import { PLATFORM_META } from "@/components/post-bits";

export interface Route {
  view: DemoView;
  filter?: DemoFilter;
  editId?: string;
  /** Epoch ms of a day to prefill (compose) or show (calendar). */
  day?: number;
}

interface State {
  route: Route;
  scope: string | null;
  clients: DemoClient[];
  posts: DemoPost[];
  toast: { id: number; text: string } | null;
  paletteOpen: boolean;
}

type Action =
  | { type: "nav"; route: Route }
  | { type: "scope"; clientId: string | null }
  | { type: "save"; post: DemoPost }
  | { type: "move"; id: string; dayStart: number }
  | { type: "approval"; id: string; approval: DemoApproval }
  | { type: "publishing"; ids: string[] }
  | { type: "published"; id: string }
  | { type: "delete"; id: string }
  | { type: "addClient"; client: DemoClient }
  | { type: "toast"; text: string }
  | { type: "clearToast"; id: number }
  | { type: "palette"; open: boolean }
  | { type: "reset"; now: number; view: DemoView };

let toastSeq = 0;

function init({ now, view }: { now: number; view: DemoView }): State {
  return {
    route: { view },
    scope: null,
    ...makeSeed(now),
    toast: null,
    paletteOpen: false,
  };
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "nav":
      return { ...s, route: a.route, paletteOpen: false };
    case "scope":
      return { ...s, scope: a.clientId, paletteOpen: false };
    case "save": {
      const exists = s.posts.some((p) => p.id === a.post.id);
      return {
        ...s,
        posts: exists
          ? s.posts.map((p) => (p.id === a.post.id ? a.post : p))
          : [a.post, ...s.posts],
      };
    }
    case "move":
      return {
        ...s,
        posts: s.posts.map((p) => {
          if (p.id !== a.id || p.at === null) return p;
          const d = new Date(p.at);
          const timeOfDay = (d.getHours() * 60 + d.getMinutes()) * 60_000;
          return { ...p, at: a.dayStart + timeOfDay };
        }),
      };
    case "approval":
      return {
        ...s,
        posts: s.posts.map((p) => (p.id === a.id ? { ...p, approval: a.approval } : p)),
      };
    case "publishing":
      return {
        ...s,
        posts: s.posts.map((p) =>
          a.ids.includes(p.id) ? { ...p, status: "PUBLISHING", error: undefined } : p,
        ),
      };
    case "published":
      return {
        ...s,
        posts: s.posts.map((p) =>
          p.id === a.id ? { ...p, status: "PUBLISHED", at: p.at ?? Date.now() } : p,
        ),
      };
    case "delete":
      return { ...s, posts: s.posts.filter((p) => p.id !== a.id) };
    case "addClient":
      return { ...s, clients: [...s.clients, a.client] };
    case "toast":
      return { ...s, toast: { id: ++toastSeq, text: a.text } };
    case "clearToast":
      return s.toast?.id === a.id ? { ...s, toast: null } : s;
    case "palette":
      return { ...s, paletteOpen: a.open };
    case "reset":
      return init({ now: a.now, view: a.view });
  }
}

function useDemoState(initialView: DemoView) {
  const [state, dispatch] = useReducer(reducer, initialView, (view: DemoView) =>
    init({ now: Date.now(), view }),
  );

  // Posts mid-publish finish after a beat, like the real thing reporting back.
  const publishing = state.posts.filter((p) => p.status === "PUBLISHING").map((p) => p.id);
  const publishingKey = publishing.join(",");
  useEffect(() => {
    if (!publishingKey) return;
    const ids = publishingKey.split(",");
    const t = window.setTimeout(() => {
      for (const id of ids) dispatch({ type: "published", id });
    }, 1800);
    return () => window.clearTimeout(t);
  }, [publishingKey]);

  // Anything approved and due goes live on its own, as in the real app.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      const due = state.posts.filter(
        (p) => p.status === "SCHEDULED" && p.approval === "APPROVED" && p.at !== null && p.at <= now,
      );
      if (due.length === 0) return;
      dispatch({ type: "publishing", ids: due.map((p) => p.id) });
      const first = due[0];
      const client = state.clients.find((c) => c.id === first.clientId);
      const nets = platformsOf(first, state.clients).map((pl) => PLATFORM_META[pl].label).join(" and ");
      dispatch({ type: "toast", text: `Cue called it: ${client?.name ?? "A post"} is going live on ${nets}.` });
    }, 1000);
    return () => window.clearInterval(id);
  }, [state.posts, state.clients]);

  // Toasts clear themselves.
  const toastId = state.toast?.id;
  useEffect(() => {
    if (!toastId) return;
    const t = window.setTimeout(() => dispatch({ type: "clearToast", id: toastId }), 3400);
    return () => window.clearTimeout(t);
  }, [toastId]);

  return { state, dispatch };
}

type Ctx = ReturnType<typeof useDemoState> & {
  /** Focused single-view demo: actions stay on the current view. */
  bare: boolean;
  scopedPosts: DemoPost[];
  clientOf: (id: string) => DemoClient | undefined;
  go: (route: Route) => void;
  toast: (text: string) => void;
  newDraft: (fields: Partial<DemoPost> & { clientId: string }) => DemoPost;
};

const DemoContext = createContext<Ctx | null>(null);

export function DemoProvider({
  initialView = "dashboard",
  bare = false,
  children,
}: {
  initialView?: DemoView;
  bare?: boolean;
  children: React.ReactNode;
}) {
  const value = useDemoState(initialView);
  const { state, dispatch } = value;

  const ctx = useMemo<Ctx>(() => {
    const clientOf = (id: string) => state.clients.find((c) => c.id === id);
    return {
      ...value,
      bare,
      scopedPosts: state.scope
        ? state.posts.filter((p) => p.clientId === state.scope)
        : state.posts,
      clientOf,
      go: (route) => dispatch({ type: "nav", route }),
      toast: (text) => dispatch({ type: "toast", text }),
      newDraft: (fields) => ({
        id: newId("post"),
        body: "",
        accountIds: [],
        at: null,
        status: "DRAFT",
        approval: "APPROVED",
        notes: 0,
        ...fields,
      }),
    };
  }, [value, state, dispatch, bare]);

  return <DemoContext.Provider value={ctx}>{children}</DemoContext.Provider>;
}

export function useDemo(): Ctx {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used inside <DemoProvider>");
  return ctx;
}

/** Re-renders every `ms` so countdowns and "today" stay current. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

export function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export { DAY_MS };
