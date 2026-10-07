# 可选 Fantasy 素材包

安装器 `--pack fantasy` 把 rigs、props 和选定 env 复制到项目。基础 Skill 不要求这套角色。API 文档来自原仓库，部分包含旧角色姓名、秒数、事件号和完整制作规范；这里只把它们作为可复用绘制 API，原歌曲的章节/镜头/接缝合同均不继承。

| 需要 | 阅读 | 源码 |
|---|---|---|
| 人类主角、身体姿态、手部骨点 | assets/hero.md | src/rigs/hero.js |
| 国王、公主 | assets/royals.md | src/rigs/king.js, princess.js |
| 马、骑乘 | assets/horse.md | src/rigs/horse.js |
| 村民、小孩、纸翼 | assets/folk.md | src/rigs/folk.js |
| 龙、多头/翅膀 | assets/dragon.md | src/rigs/dragon.js |
| 城堡、窗框、吊桥、天空 | assets/castle.md | src/env/castle.js 等 |
| 广场、王座 | assets/plaza_throne.md | src/env/plaza.js, throne.js |
| 卷轴、信件、牌子、道具 | assets/props.md | src/props/*.js |
| 台词/花字/纸 UI | assets/ui.md | src/ui/type.js, kit.js |

先检查实际模块导出。不要从文档假定未复制的 journey/map/theater 模块存在。部分复古 RPG 道具有 NAME_TIMES('E02') 等历史默认参数；新项目必须传实际 chars/times 或提供对应 TIMELINE.words，不能依赖旧默认。项目 names 可替换显示名称，角色姿态仍按 rig 的参数支持范围调用。

邮递员示例的 cast.js 演示把人类 rig 加帽子和邮包，并自行制作信封、纸船、星星。新故事可借用这个组合方式，复制或扩展之前先查看返回骨点坐标及尺寸。
