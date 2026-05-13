/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Send, 
  SendHorizontal,
  CloudUpload,
  Clock, 
  Palette, 
  Cpu, 
  CheckCircle2, 
  Copy, 
  RefreshCcw,
  LayoutTemplate,
  Hash,
  ArrowRight,
  User,
  Zap,
  Image as ImageIcon,
  Camera,
  X
} from 'lucide-react';
import { generateDouyinCopy } from './services/ai';
import { CopywritingConfig, CopywritingResult } from './types';

interface SaasContext {
  userId: string | null;
  toolId: string | null;
  integral: number;
  toolIntegral: number;
  launchLoaded: boolean;
}

export default function App() {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [config, setConfig] = useState<CopywritingConfig>({
    mainTitle: '',
    highlights: ['成分党'],
    details: '',
    model: 'gemini',
    contentStyle: '情绪共鸣风格',
    duration: '15-30s',
    referenceImageUrl: ''
  });
  const [result, setResult] = useState<CopywritingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // SaaS Context
  const [saas, setSaas] = useState<SaasContext>({
    userId: null,
    toolId: null,
    integral: 0,
    toolIntegral: 0,
    launchLoaded: false
  });

  const toggleHighlight = (item: string) => {
    setConfig(prev => ({
      ...prev,
      highlights: prev.highlights.includes(item) 
        ? prev.highlights.filter(i => i !== item)
        : [...prev.highlights, item]
    }));
  };

  useEffect(() => {
    // Listen for SaaS initialization message
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'SAAS_INIT') {
        let { userId, toolId } = event.data;
        // Filter invalid placeholder strings
        if (userId === 'null' || userId === 'undefined') userId = null;
        if (toolId === 'null' || toolId === 'undefined') toolId = null;
        
        if (userId && toolId) {
          initSaas(userId, toolId);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Check URL params as fallback
    const params = new URLSearchParams(window.location.search);
    let userId = params.get('userId');
    let toolId = params.get('toolId');
    
    // Filter invalid placeholder strings
    if (userId === 'null' || userId === 'undefined') userId = null;
    if (toolId === 'null' || toolId === 'undefined') toolId = null;

    if (userId && toolId) {
      initSaas(userId, toolId);
    }

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const initSaas = async (userId: string, toolId: string) => {
    try {
      const res = await fetch('/api/tool/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, toolId })
      });
      const json = await res.json();
      if (json.success) {
        setSaas({
          userId,
          toolId,
          integral: json.data.user.integral,
          toolIntegral: json.data.tool.integral,
          launchLoaded: true
        });
      }
    } catch (err) {
      console.error('Launch failed:', err);
    }
  };

  const highlightOptions = ['成分党', '高性价比', '贵妇级', '懒人必备', '敏感肌友好', '纯素养肤'];
  const styleOptions = ['情绪共鸣风格', '干货科普风格', '反转风格', '真实种草风格', '数据背书风格', '轻松俏皮风格'];
  const durationOptions: CopywritingConfig['duration'][] = ['15-30s', '30-60s', '1-3min'];

  const handleImageUpload = async (file: File) => {
    if (!saas.userId) return;
    setUploading(true);
    try {
      // 1. Get direct upload token
      const tokenRes = await fetch('/api/upload/direct-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: saas.userId,
          source: 'input',
          fileName: file.name,
          mimeType: file.type || 'image/png',
          fileSize: file.size
        })
      });
      const tokenJson = await tokenRes.json();
      if (!tokenJson.success) throw new Error(tokenJson.message || '获取上传凭证失败');

      // 2. PUT to OSS
      await fetch(tokenJson.uploadUrl, {
        method: tokenJson.method,
        headers: tokenJson.headers,
        body: file
      });

      // 3. Set reference URL
      setConfig(prev => ({ ...prev, referenceImageUrl: tokenJson.url }));
    } catch (err: any) {
      setError(err.message || '图片上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    if (!config.mainTitle.trim()) {
      setError('请输入主要标题内容');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      // 1. Verify credits if saas context is loaded
      if (saas.launchLoaded) {
        const verifyRes = await fetch('/api/tool/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: saas.userId, toolId: saas.toolId })
        });
        const verifyJson = await verifyRes.json();
        if (!verifyJson.success) {
          setError(verifyJson.message || '积分不足或校验失败');
          setLoading(false);
          return;
        }
      }

      // 2. Generate content
      const data = await generateDouyinCopy(config);
      setResult(data);

      // 3. Consume credits
      if (saas.launchLoaded) {
        const consumeRes = await fetch('/api/tool/consume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: saas.userId, toolId: saas.toolId })
        });
        const consumeJson = await consumeRes.json();
        if (consumeJson.success) {
          setSaas(prev => ({ ...prev, integral: consumeJson.data.currentIntegral }));
        }
      }
    } catch (err: any) {
      setError(err.message || '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#fafbfc] text-[#1a1a1a] font-sans">
      {/* Top Navigation */}
      <nav className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-[#FE2C55] p-1.5 rounded-lg shadow-lg shadow-[#FE2C55]/20">
            <Sparkles className="text-white fill-white" size={20} />
          </div>
          <h1 className="font-bold text-xl tracking-tight">Douyin <span className="text-[#FE2C55]">美妆营销专家</span></h1>
        </div>
        <div className="flex items-center gap-6">
          {saas.launchLoaded && (
            <div className="flex flex-col items-end">
              <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">当前剩余积分</div>
              <div className="text-sm font-bold text-[#FE2C55] flex items-center gap-1">
                <Zap size={14} className="fill-[#FE2C55]" />
                {saas.integral}
              </div>
            </div>
          )}
          <div className="text-sm text-gray-500">
            单次消耗: <span className="text-gray-900 font-bold">{saas.toolIntegral || 10}</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 border border-gray-200 overflow-hidden">
            <User size={18} />
          </div>
        </div>
      </nav>

      <main className="max-w-[1440px] mx-auto p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Column 1: Step 1 - Core Info */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-100 p-6 shadow-xl shadow-gray-200/50 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-[#FE2C55] text-white flex items-center justify-center text-sm font-bold shadow-md shadow-[#FE2C55]/30">1</div>
              <h2 className="font-bold text-lg">产品核心配置</h2>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2">产品参考图片 (可选)</label>
                <div className="grid grid-cols-1 gap-4">
                  {!config.referenceImageUrl ? (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-gray-100 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 bg-[#f8fbff] hover:bg-blue-50/50 hover:border-[#FE2C55]/20 cursor-pointer transition-all group"
                    >
                      <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-400 group-hover:text-[#FE2C55] transition-colors">
                        {uploading ? <RefreshCcw className="animate-spin" /> : <Camera size={24} />}
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-bold text-gray-500">{uploading ? '上传中...' : '点击或拖拽上传产品图'}</p>
                        <p className="text-[10px] text-gray-400 mt-1">AI 将根据图片进行深度视觉分析</p>
                      </div>
                    </div>
                  ) : (
                    <div className="relative rounded-2xl overflow-hidden border border-gray-100 shadow-sm group">
                      <img 
                        src={config.referenceImageUrl} 
                        alt="Reference" 
                        className="w-full h-48 object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="bg-white text-gray-900 px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-2"
                        >
                          <RefreshCcw size={14} /> 换一张
                        </button>
                        <button 
                          onClick={() => setConfig({...config, referenceImageUrl: ''})}
                          className="bg-[#FE2C55] text-white p-2 rounded-full shadow-lg"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                  <input 
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file);
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2">主要标题 / 产品名称</label>
                <input 
                  type="text"
                  value={config.mainTitle}
                  onChange={(e) => setConfig({...config, mainTitle: e.target.value})}
                  placeholder="例如：30天皮肤逆袭的秘密武器..."
                  className="w-full bg-[#f8fbff] border border-gray-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FE2C55]/20 focus:border-[#FE2C55]/40 transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-500 mb-3">预计片长</label>
                <div className="grid grid-cols-3 gap-2">
                  {durationOptions.map(d => (
                    <button 
                      key={d}
                      onClick={() => setConfig({...config, duration: d})}
                      className={`py-2.5 rounded-lg text-[11px] font-bold transition-all ${
                        config.duration === d 
                        ? 'bg-[#FE2C55] text-white' 
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {d === '15-30s' ? '15-30秒' : d === '30-60s' ? '30-60秒' : '1-3分钟'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-500 mb-3">内容风格</label>
                <div className="grid grid-cols-2 gap-2">
                  {styleOptions.map(s => (
                    <button 
                      key={s}
                      onClick={() => setConfig({...config, contentStyle: s})}
                      className={`py-2.5 rounded-lg text-[11px] font-bold transition-all ${
                        config.contentStyle === s 
                        ? 'bg-[#FE2C55] text-white shadow-lg shadow-[#FE2C55]/30' 
                        : 'bg-gray-100 text-[#1a1a1a] hover:bg-gray-200'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2">视频详情具体细节 (可选)</label>
                <textarea 
                  value={config.details}
                  onChange={(e) => setConfig({...config, details: e.target.value})}
                  placeholder="请输入您的具体使用感受，或者想在文案中特别强调的细节..."
                  className="w-full bg-[#f8fbff] border border-gray-100 rounded-xl px-4 py-3 h-40 resize-none focus:outline-none focus:ring-2 focus:ring-[#FE2C55]/20 transition-all text-sm leading-relaxed"
                />
              </div>
            </div>
          </div>

          {/* Column 2: Step 2 - Categorization & Engine */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xl shadow-gray-200/50 space-y-6 flex-1">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-[#FE2C55] text-white flex items-center justify-center text-sm font-bold shadow-md shadow-[#FE2C55]/30">2</div>
                <h2 className="font-bold text-lg">分类与引擎配置</h2>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-500 mb-3">AI 创作模型</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setConfig({...config, model: 'gemini'})}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                        config.model === 'gemini' ? 'border-[#FE2C55] bg-[#FE2C55]/5' : 'border-gray-50 bg-gray-50 hover:border-gray-200'
                      }`}
                    >
                      <Sparkles size={20} className={config.model === 'gemini' ? 'text-[#FE2C55]' : 'text-gray-400'} />
                      <span className="text-[11px] font-bold text-center">Gemini 3.1<br/><span className="text-[9px] opacity-60">极速版</span></span>
                    </button>
                    <button 
                      onClick={() => setConfig({...config, model: 'gpt'})}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                        config.model === 'gpt' ? 'border-[#FE2C55] bg-[#FE2C55]/5' : 'border-gray-50 bg-gray-50 hover:border-gray-200'
                      }`}
                    >
                      <Cpu size={20} className={config.model === 'gpt' ? 'text-[#FE2C55]' : 'text-gray-400'} />
                      <span className="text-[11px] font-bold text-center">OpenAI GPT-4o<br/><span className="text-[9px] opacity-60">深度级 (需Key)</span></span>
                    </button>
                  </div>
                  {config.model === 'gpt' && (
                    <p className="mt-2 text-[10px] text-gray-400">注：使用 GPT-4o 需在环境变量中配置 OPENAI_API_KEY。</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-500 mb-2">核心卖点标签 (多选)</label>
                  <div className="flex flex-wrap gap-2">
                    {highlightOptions.map(e => (
                      <button 
                        key={e}
                        onClick={() => toggleHighlight(e)}
                        className={`px-3 py-1.5 rounded-lg text-xs border font-bold transition-all ${
                          config.highlights.includes(e)
                          ? 'border-[#FE2C55] text-[#FE2C55] bg-[#FE2C55]/5'
                          : 'border-gray-100 bg-[#f8fbff] text-gray-500'
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-6">

                <button 
                  onClick={handleGenerate}
                  disabled={loading}
                  className="w-full bg-[#10141d] hover:bg-[#1a202e] text-white py-4 rounded-xl flex items-center justify-center gap-2 font-bold transition-all active:scale-[0.98] disabled:opacity-70 shadow-lg shadow-gray-400/20"
                >
                  {loading ? (
                    <RefreshCcw className="animate-spin" size={18} />
                  ) : (
                    <Zap size={18} className="fill-white" />
                  )}
                  {loading ? '正在分析创作中...' : '深度分析生成'}
                </button>
              </div>
            </div>
          </div>

          {/* Column 3: Preview */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-100 p-6 shadow-xl shadow-gray-200/50 min-h-[600px] flex flex-col relative overflow-hidden">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-7 h-7 rounded-full bg-[#FE2C55] text-white flex items-center justify-center text-sm font-bold shadow-md shadow-[#FE2C55]/30">3</div>
              <h2 className="font-bold text-lg italic">预览爆款脚本</h2>
            </div>
            
            <AnimatePresence mode="wait">
              {!result && !loading && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 flex items-center justify-center text-gray-400 text-sm italic"
                >
                  等待分析生成...
                </motion.div>
              )}

              {loading && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 flex flex-col items-center justify-center gap-4 py-20"
                >
                  <div className="w-12 h-12 border-4 border-gray-100 border-t-[#FE2C55] rounded-full animate-spin" />
                  <p className="text-sm font-bold text-[#FE2C55] animate-pulse">正在捕捉流量密码...</p>
                </motion.div>
              )}

              {result && !loading && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar"
                >
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-[#FE2C55] uppercase tracking-wider">爆款标题建议</h3>
                    <div className="space-y-2">
                      {result.titles.map((t, i) => (
                        <div 
                          key={i} 
                          onClick={() => copyToClipboard(t, `标题${i+1}`)}
                          className="bg-[#f8fbff] p-3 rounded-xl text-sm font-medium border border-blue-50/50 relative group cursor-pointer hover:bg-blue-100/30 transition-colors"
                        >
                          {t}
                          <button className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1 rounded bg-white/80 shadow-sm transition-all">
                            <Copy size={14} className="text-gray-400 hover:text-[#FE2C55]" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-[#FE2C55] uppercase tracking-wider">美妆博主脚本</h3>
                    <div className="bg-[#fdf9f9] p-4 rounded-2xl border border-red-50/50 space-y-4 shadow-inner">
                      <div className="text-sm font-bold text-gray-800 pb-2 border-b border-red-100/30 line-clamp-1">📜 脚本拆解</div>
                      <div className="space-y-4 text-sm leading-relaxed text-gray-700">
                        <div 
                          onClick={() => copyToClipboard(`${result.sections.opening} ${result.sections.hook}`, '开头钩子')}
                          className="bg-white/50 p-3 rounded-xl border border-gray-100 cursor-pointer hover:border-[#FE2C55]/30 hover:bg-white transition-all group relative"
                        >
                          <p><span className="font-bold text-[#FE2C55] mr-2">【视频开头钩子】</span></p>
                          <p className="mt-1">{result.sections.opening} {result.sections.hook}</p>
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Copy size={12} className="text-gray-400" />
                          </div>
                        </div>
                        <div 
                          onClick={() => copyToClipboard(result.sections.body, '正文')}
                          className="bg-white/50 p-3 rounded-xl border border-gray-100 cursor-pointer hover:border-[#FE2C55]/30 hover:bg-white transition-all group relative"
                        >
                          <p><span className="font-bold text-[#FE2C55] mr-2">【正文】</span></p>
                          <p className="mt-1">{result.sections.body}</p>
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Copy size={12} className="text-gray-400" />
                          </div>
                        </div>
                        <div 
                          onClick={() => copyToClipboard(result.sections.outro, '结尾引导')}
                          className="bg-white/50 p-3 rounded-xl border border-gray-100 cursor-pointer hover:border-[#FE2C55]/30 hover:bg-white transition-all group relative"
                        >
                          <p><span className="font-bold text-[#FE2C55] mr-2">【结尾引导关注评论点赞】</span></p>
                          <p className="mt-1">{result.sections.outro}</p>
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Copy size={12} className="text-gray-400" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-[#FE2C55] uppercase tracking-wider">标签</h3>
                    <div className="flex flex-wrap gap-2">
                      {result.hashtags.map((h, i) => (
                        <span key={i} className="text-[#3a6ea5] text-xs font-medium cursor-pointer hover:underline" onClick={() => copyToClipboard(`#${h}`, `标签 #${h}`)}>#{h}</span>
                      ))}
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      const allText = `爆款标题建议：\n${result.titles.join('\n')}\n\n【视频开头钩子】：\n${result.sections.opening} ${result.sections.hook}\n\n【正文】：\n${result.sections.body}\n\n【结尾引导关注评论点赞】：\n${result.sections.outro}\n\n标签：${result.hashtags.map(h => '#' + h).join(' ')}`;
                      copyToClipboard(allText, '全部脚本');
                    }}
                    className="w-full bg-[#fdf9f9] border border-red-100 text-[#FE2C55] py-3 rounded-xl text-sm font-bold hover:bg-[#FE2C55]/5 transition-all flex items-center justify-center gap-2"
                  >
                    <Copy size={16} /> 复制全部脚本
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {error && (
        <div className="fixed bottom-6 right-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl shadow-xl flex items-center gap-3 animate-bounce">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-sm font-bold">{error}</span>
        </div>
      )}

      <AnimatePresence>
        {copied && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-[#10141d] text-white px-6 py-2 rounded-full text-sm font-bold shadow-2xl flex items-center gap-2 z-[100]"
          >
            <CheckCircle2 size={16} className="text-green-400" />
            {copied} 已复制到剪贴板
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
