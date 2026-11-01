// @vitest-environment jsdom
/**
 * QuestionCard —— 题卡(题干常显、答案折叠)。
 *
 * 盯四件事:
 *   1. 题干永远可见;参考答案初始**根本不在 DOM 里**(不是用 CSS 藏起来)
 *   2. 「看参考答案」是受控 disclosure(button + aria-expanded),展开/收起都走它
 *   3. 难度 / 分类 / 考点三个标签都对
 *   4. 星级在两页语义不同(押题页「重点关注」/ 题库页「收藏」),回调拿到新的收藏状态
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QuestionCard } from "./question-card";

const QUESTION = "介绍一下 RAG 检索里你用的召回策略，为什么选它而不是别的？";
const ANSWER = "混合召回：BM25 兜底 + 向量召回补语义，两路各取 top-50 再用 RRF 融合。";
const TOPIC = "RAG 召回策略";

function baseProps() {
  return {
    question: QUESTION,
    answer: ANSWER,
    difficulty: 2,
    category: "basic",
    topic: TOPIC,
    starred: false,
  };
}

afterEach(() => {
  cleanup();
});

describe("QuestionCard", () => {
  it("题干始终可见,参考答案初始根本不在渲染结果里", () => {
    render(<QuestionCard {...baseProps()} />);

    expect(screen.getByText(QUESTION)).toBeTruthy();
    expect(screen.queryByText(ANSWER)).toBeNull();
  });

  it("折叠态不露答案摘要 —— 卡片里搜不到答案里的任何片段", () => {
    render(<QuestionCard {...baseProps()} />);

    // 答案里的独特片段不该在页面上留下任何痕迹
    expect(document.body.textContent).not.toContain("RRF");
    expect(document.body.textContent).not.toContain("BM25");
  });

  it("「看参考答案」是受控 disclosure:带 aria-expanded,点开出现答案,再点收起", () => {
    render(<QuestionCard {...baseProps()} />);

    const toggle = screen.getByRole("button", { name: "看参考答案" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(ANSWER)).toBeNull();

    fireEvent.click(toggle);

    expect(screen.getByText(ANSWER)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "看参考答案" }).getAttribute("aria-expanded"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "看参考答案" }));

    expect(screen.queryByText(ANSWER)).toBeNull();
    expect(
      screen.getByRole("button", { name: "看参考答案" }).getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("答案容器的 id 与折叠按钮的 aria-controls 对得上", () => {
    render(<QuestionCard {...baseProps()} />);

    const toggle = screen.getByRole("button", { name: "看参考答案" });
    const controls = toggle.getAttribute("aria-controls");
    expect(controls).toBeTruthy();

    fireEvent.click(toggle);

    const region = screen.getByRole("region", { name: "参考答案" });
    expect(region.getAttribute("id")).toBe(controls);
  });

  it("难度 / 分类 / 考点三个标签都渲染出来", () => {
    render(<QuestionCard {...baseProps()} difficulty={2} category="basic" topic={TOPIC} />);

    expect(screen.getByText("熟练使用")).toBeTruthy();
    expect(screen.getByText("基础")).toBeTruthy();
    expect(screen.getByText(TOPIC)).toBeTruthy();
  });

  it("四档难度各有各的标签", () => {
    const cases: Array<[number, string]> = [
      [1, "入门理解"],
      [2, "熟练使用"],
      [3, "原理机制"],
      [4, "场景深挖"],
    ];
    for (const [difficulty, label] of cases) {
      const { unmount } = render(
        <QuestionCard {...baseProps()} difficulty={difficulty} category="deep" />,
      );
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByText("深挖")).toBeTruthy();
      unmount();
    }
  });

  it("星级按钮可点,回调能拿到新的收藏状态", () => {
    const onStarChange = vi.fn();
    render(<QuestionCard {...baseProps()} onStarChange={onStarChange} />);

    const star = screen.getByRole("button", { name: "收藏" });
    expect(star.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(star);

    expect(onStarChange).toHaveBeenCalledWith(true);
  });

  it("已收藏时点星级,回调传出的是「取消收藏」(false)", () => {
    const onStarChange = vi.fn();
    render(<QuestionCard {...baseProps()} starred onStarChange={onStarChange} />);

    const star = screen.getByRole("button", { name: "取消收藏" });
    expect(star.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(star);

    expect(onStarChange).toHaveBeenCalledWith(false);
  });

  it("押题页语义是「重点关注」,题库页语义是「收藏」", () => {
    const { unmount } = render(
      <QuestionCard {...baseProps()} starMode="focus" onStarChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "重点关注" })).toBeTruthy();
    unmount();

    render(<QuestionCard {...baseProps()} starMode="favorite" onStarChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "收藏" })).toBeTruthy();
  });

  it("本地 state 驱动:不接回调时,点星标照样能翻转", () => {
    render(<QuestionCard {...baseProps()} />);

    const star = screen.getByRole("button", { name: "收藏" });
    fireEvent.click(star);

    expect(screen.getByRole("button", { name: "取消收藏" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("接口回写驱动:父组件把 starred 改回来,星标跟着回退", () => {
    function Host() {
      const [starred, setStarred] = useState(true);
      return (
        <QuestionCard
          {...baseProps()}
          starred={starred}
          onStarChange={(next) => setStarred(next)}
        />
      );
    }
    render(<Host />);

    expect(screen.getByRole("button", { name: "取消收藏" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "取消收藏" }));

    expect(screen.getByRole("button", { name: "收藏" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });
});
