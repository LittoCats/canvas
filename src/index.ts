/*******************************************************************************
 * @author      : 程巍巍 (littocats@gmail.com)
 * @created     : Thursday Jun 15, 2023 16:40:26 CST
 *
 * @uuid        : 4fc2766559bdc41e6e82fa6b748d528d
 *
 * @description : canvas.tsx
 *
 ******************************************************************************/

import React, {
  HTMLProps,
  PropsWithChildren,
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
type N = number;
type Matrix4 = [N, N, N, N, N, N, N, N, N, N, N, N, N, N, N, N];
type Render<T = any> = {
  priority: number;
  (canvas: Canvas, context: T): any;
};
type Canvas = HTMLCanvasElement;

type Props<T = any> = {
  /**
   * true 使用 requestAnimationFrame 或 setTimeout($callback, 1000/60) 循环渲染
   * number 使用 setTimeout($render, Math.max(1000/60, $runloop)) 循环渲染
   * typeof requestAnimationFrame 定时循环渲染
   *
   * false 或 undefined 时，只渲染一次；
   * 如果 canvas 大小发生了变化，或 Renderers 发生了变化，会重新渲染
   */
  runloop?: boolean | number | typeof requestAnimationFrame;
  /**
   * Surface 实例发生变化时，调用一次
   * 返回值作为第二个参数传递给 before 和 after 及 render 方法
   * @param canvas
   */
  setup?(canvas: Canvas): T | Promise<T>;
  /**
   * 每次渲染循环开始前调用该方法, 可以用来清空 canvas 或做一些设置
   * 如果抛出了错误，不会继续渲染，并退出渲染循环
   * @param canvas
   * @param context
   */
  before?(canvas: Canvas, context?: T): void;
  /**
   * 每次渲染循环结束后调用该方法, 可以用来清空 canvas 或做一些设置
   * 如果抛出了错误，退出渲染循环
   * @param canvas
   * @param context
   */
  after?(canvas: Canvas, context?: T): void;
};

type Context = Omit<Props, 'setup'> & {
  setCanvas: (canvas: Canvas | null) => void;
  addRender: (render: Render) => void;
  delRender: (render: Render) => void;
};
const Context = createContext<null | Context>(null);

export default Canvas;
export { Canvas, useRender, Surface, transform };

function Canvas({ children, ...props }: PropsWithChildren<Props>) {
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [renders, setRenders] = useState<Render[]>([]);

  const context = useMemo(
    () => ({
      setCanvas,
      addRender: (render: Render) =>
        setRenders((renders) => {
          if (renders.find((it) => it === render)) return renders;
          renders = renders.concat([render]);
          renders.sort(({ priority: lv }, { priority: rv }) => (lv > rv ? -1 : lv < rv ? 1 : 0));
          return renders;
        }),
      delRender: (render: Render) =>
        setRenders((renders) => {
          if (renders.find((it) => it === render)) renders = renders.filter((it) => it !== render);
          return renders;
        }),
    }),
    [],
  );

  const setup = useMemo(() => {
    let initialized = false;
    let context: any;
    return initialize;

    async function initialize(canvas: Canvas) {
      if (initialized) return context;
      context = await props.setup?.(canvas);
      initialized = true;
      return context;
    }
  }, [props.setup]);

  const render = useCallback(async () => {
    if (!canvas) return;
    const context = await setup(canvas);
    await props.before?.(canvas, context);
    for (let render of renders) {
      try {
        await render(canvas, context);
      } catch (e) {
        console.error(e);
      }
    }
    await props.after?.(canvas, context);
  }, [setup, canvas, props.before, props.after, renders]);

  const runloop = useMemo(() => {
    const runloop = props.runloop;
    if (runloop === true) return requestAnimationFrame || ((render: () => void) => setTimeout(render, 1000 / 60));
    if (typeof runloop === 'number') return (render: () => void) => setTimeout(render, runloop);
    if (typeof runloop === 'function') return runloop;
    return null;
  }, [props.runloop]);

  useEffect(() => {
    let run = true;
    loop();

    return () => {
      run = false;
    };

    async function loop() {
      if (!run) return;
      await render();
      runloop?.(loop);
    }
  }, [render, runloop]);

  return createElement(Context.Provider, { value: context }, children);
}

function Surface(props: HTMLProps<HTMLCanvasElement>) {
  const { setCanvas } = useContext(Context) || {};
  return createElement('canvas', { ...props, ref: setCanvas });
}

function useRender<C = any>(render: (canvas: Canvas, context: C) => any): void;
function useRender<T, C = any>(
  setup: (canvas: Canvas, context: C) => T | Promise<T>,
  render: (canvas: Canvas, context: T) => any,
): void;
function useRender<T, C = any>(
  setup: (canvas: Canvas, context: C) => T | Promise<T>,
  render: (canvas: Canvas, context: T) => any,
  priority: number,
): void;
function useRender(...argv: any[]): void {
  const [a0, a1, a2] = argv;
  const [t0, t1, t2] = [typeof a0, typeof a1, typeof a2];
  const [setup, renderer, priority] = t1 == 'function' ? [a0, a1, a2 || 0] : [null, a0, a1 || 0];

  const context = useMemo(() => {
    let initialized = false;
    let context: any;
    return initialize;

    async function initialize(canvas: Canvas, previous: any) {
      if (initialized) return context;
      context = await (setup ? setup(canvas, previous) : previous);
      initialized = true;
      return context;
    }
  }, [setup]);

  const render = useMemo(() => {
    render.priority = priority;
    return render;

    async function render(canvas: Canvas, previous: any) {
      return renderer(canvas, await context(canvas, previous));
    }
  }, [renderer, priority, context]);

  const { addRender, delRender } = useContext(Context) || {};

  useEffect(() => {
    addRender?.(render);
    return () => delRender?.(render);
  }, [render, addRender, delRender]);
}

function transform(target: HTMLElement, anchor: HTMLElement, mode: '2d' | 'webgl' | 'webgl2' = '2d'): Matrix4 {
  const { width: tw, height: th, top: tt, left: tl } = target.getBoundingClientRect();
  const { width: aw, height: ah, top: at, left: al } = anchor.getBoundingClientRect();

  const sx = aw / tw;
  const sy = ah / th;
  const sz = 1;
  const tx = (al + aw / 2 - (tl + tw / 2)) / tw;
  const ty = (at + ah / 2 - (tt + th / 2)) / th;
  const tz = 0;

  const tc = mode === '2d' ? 1 : 2;
  const yc = mode === '2d' ? 1 : -1;
  return [sx, 0, 0, tx * tc, 0, sy, 0, ty * tc * yc, 0, 0, sz, tz * tc, 0, 0, 0, 1];
}
