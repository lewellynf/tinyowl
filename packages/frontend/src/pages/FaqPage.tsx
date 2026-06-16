import { Typography, Collapse, Alert } from 'antd';

const { Title, Paragraph, Text } = Typography;

export default function FaqPage() {
  return (
    <div className="to-section">
      <div className="to-card">
        <Title level={3} style={{ marginTop: 0 }}>常见问题与科普</Title>

        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 20 }}
          message="使用建议"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>榜单排名不等于完全可信，技术指标仅供参考。</li>
              <li>建议先小额充值试用，确认稳定后再大额投入。</li>
            </ul>
          }
        />

        <Collapse
          defaultActiveKey={['1']}
          items={[
            {
              key: '1',
              label: '什么是 API 中转站？它是如何工作的？',
              children: (
                <Paragraph>
                  API 中转站（model-relay）是对外提供 OpenAI 兼容接口、转售各大模型厂商（OpenAI、Anthropic、Google
                  等）API 能力的第三方服务。用户将请求发往中转站，由中转站代为调用上游官方 API
                  并返回结果。中转站通常以更低价格或更便捷的支付方式吸引用户，但其内部实现对用户不透明。
                </Paragraph>
              ),
            },
            {
              key: '2',
              label: '中转站存在哪些风险？',
              children: (
                <ul style={{ paddingLeft: 18 }}>
                  <li>
                    <Text strong>协议不一致：</Text>响应不完全符合 OpenAI
                    兼容协议，字段缺失或流式格式异常，可能导致客户端兼容问题。
                  </li>
                  <li>
                    <Text strong>模型身份替换：</Text>声称提供某高配模型，实际由其他模型应答。
                  </li>
                  <li>
                    <Text strong>降智：</Text>用低配/量化模型冒充高配模型，能力明显低于声称水平。
                  </li>
                  <li>
                    <Text strong>日志与密钥不透明：</Text>无法确认中转站是否记录请求内容或保存你的 API Key。
                  </li>
                  <li>
                    <Text strong>高配低卖：</Text>以远低于成本的价格出售，往往伴随掺水、限速或不稳定。
                  </li>
                </ul>
              ),
            },
            {
              key: '3',
              label: 'Tiny Owl 的检测原理是什么？六个维度分别检测什么？',
              children: (
                <ul style={{ paddingLeft: 18 }}>
                  <li>
                    <Text strong>返回协议一致性：</Text>校验响应是否符合 OpenAI
                    兼容协议的字段（id/object/choices/model）与流式 SSE 格式。
                  </li>
                  <li>
                    <Text strong>响应结构：</Text>校验 usage、finish_reason、role
                    等结构字段的完整性与取值合法性。
                  </li>
                  <li>
                    <Text strong>知识问答结果：</Text>发送已知确定答案的探测题，比对命中率，过低提示能力不符。
                  </li>
                  <li>
                    <Text strong>身份一致性：</Text>通过身份探测题判断模型自述身份是否与目标模型一致。
                  </li>
                  <li>
                    <Text strong>思维链痕迹：</Text>检测响应中是否存在与目标模型推理特征匹配的思维链。
                  </li>
                  <li>
                    <Text strong>签名指纹：</Text>采集多次采样的统计指纹（长度分布、离散度等），基于秩的均匀性检验思路与基线比对。
                  </li>
                </ul>
              ),
            },
            {
              key: '4',
              label: '我的 API Key 安全吗？',
              children: (
                <Paragraph>
                  你的 API Key 通过 HTTPS 加密传输，仅在检测任务执行期间存活于服务端内存中，
                  任务结束（含成功、失败、出错）后立即从内存删除，不写入任何持久化存储。
                  检测历史只保存脱敏后的结果（接口标识掩码、各维度结论），不含密钥明文。
                  日志中任何形似密钥的字符串都会以「首 4****尾 4」的掩码形式记录。
                  即便如此，仍建议优先使用仅用于测试的 API Key。
                </Paragraph>
              ),
            },
            {
              key: '5',
              label: '检测结论可以作为最终依据吗？',
              children: (
                <Paragraph>
                  不可以。本检测为低成本技术性验证，非法律审计，不保证 100%
                  准确。技术指标不等于信誉保证，结论仅供参考。建议结合榜单、口碑与小额充值试用综合判断。
                </Paragraph>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
