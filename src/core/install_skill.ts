// 安装 Skill 到 Claude Code
import { join, dirname } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * 获取 Skill 文件路径
 */
function getSkillSourcePath(): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  // 从 dist/core/install_skill.js 到项目根目录
  const projectDir = dirname(dirname(dirname(currentFilePath)));
  return join(projectDir, 'skills', 'biji-cli', 'SKILL.md');
}

/**
 * 获取目标 Skill 目录
 */
function getSkillTargetPath(): string {
  return join(homedir(), '.claude', 'skills', 'biji-cli');
}

/**
 * 安装 Skill
 */
export async function installSkill() {
  console.log('\n📦 安装 biji-cli Skill...\n');

  const skillSourcePath = getSkillSourcePath();
  const skillTargetDir = getSkillTargetPath();
  const skillTargetPath = join(skillTargetDir, 'SKILL.md');

  // 检查源文件是否存在
  if (!existsSync(skillSourcePath)) {
    console.error('❌ Skill 文件不存在:', skillSourcePath);
    console.log('\n请确保从正确位置安装 biji-cli');
    process.exit(1);
  }

  // 创建目标目录
  try {
    mkdirSync(skillTargetDir, { recursive: true });
  } catch (error) {
    console.error('❌ 创建目录失败:', error);
    process.exit(1);
  }

  // 复制 Skill 文件
  try {
    const skillContent = readFileSync(skillSourcePath, 'utf-8');
    writeFileSync(skillTargetPath, skillContent, 'utf-8');
  } catch (error) {
    console.error('❌ 复制 Skill 文件失败:', error);
    process.exit(1);
  }

  console.log('✅ Skill 安装成功！\n');
  console.log('安装位置:', skillTargetPath);
  console.log('\n📝 使用说明:');
  console.log('1. 重启 Claude Code（如果正在运行）');
  console.log('2. 现在您可以直接使用关键词触发 biji-cli：');
  console.log('   - "保存最新的 biji 笔记"');
  console.log('   - "获取笔记 123456"');
  console.log('   - "从 biji 获取这个笔记"');
  console.log('\n💡 提示: Skill 会自动调用 biji-cli 命令，无需手动输入命令\n');
}

/**
 * 检查 Skill 是否已安装
 */
export function checkSkillInstalled(): boolean {
  const skillTargetPath = join(getSkillTargetPath(), 'SKILL.md');
  return existsSync(skillTargetPath);
}
