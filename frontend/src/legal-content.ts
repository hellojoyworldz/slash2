import { Language } from './i18n';

// 법적 문서(개인정보처리방침·이용약관)의 본문 — ko 원본 + en·ja 번역.
//
// ⚠️ 법률 자문 아님: 아래 문구는 개발용 표준 초안일 뿐이며, 실제 서비스 배포 전
//    반드시 법률 전문가의 검토를 거쳐야 한다. 문의 이메일·시행일·최종 수정일은
//    플레이스홀더(대괄호)로 남겨 두었으니 배포 시 실제 값으로 교체할 것.
//
// UI 문자열이 아니라 "장문의 구조화된 문서"라서 i18n 로케일 파일(짧은 문구 사전)에
// 넣지 않고 여기 별도 파일에 로케일별 구조체(제목·섹션[제목+문단들])로 둔다.
// LegalScreen이 현재 언어로 이 구조체를 골라 렌더한다.

export type LegalDocKind = 'privacy' | 'terms';

export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDocument {
  title: string;
  /** "최종 수정일" 같은 라벨 (헤더 서브타이틀 앞부분) */
  lastUpdatedLabel: string;
  /** 최종 수정일 값 — 배포 전 교체할 플레이스홀더 */
  lastUpdated: string;
  intro: string[];
  sections: LegalSection[];
  /** 문서 끝 시행일 문장 — 시행일은 플레이스홀더 */
  effectiveNote: string;
}

type LegalContent = Record<Language, Record<LegalDocKind, LegalDocument>>;

export const LEGAL_CONTENT: LegalContent = {
  // ── 한국어 (원본) ──
  ko: {
    privacy: {
      title: '개인정보처리방침',
      lastUpdatedLabel: '최종 수정일',
      lastUpdated: '[최종 수정일]',
      intro: [
        'slash(이하 "서비스")는 이용자의 개인정보를 소중하게 생각하며, 관련 법령을 준수합니다. 본 개인정보처리방침은 서비스가 어떤 정보를 수집하고, 어떻게 이용하며, 어떻게 보호하는지를 설명합니다.',
        'slash는 사용자가 자신에게 보내는 메모와 링크를 저장하고 정리하도록 돕는 개인용 도구입니다.',
      ],
      sections: [
        {
          heading: '1. 수집하는 정보',
          body: [
            '계정 정보: 이메일 주소, 비밀번호(암호화하여 저장), 소셜 로그인으로 가입한 경우 해당 제공자가 발급한 식별자, 그리고 사용자가 설정한 표시 이름.',
            '이용 콘텐츠: 사용자가 직접 저장한 메모와 링크(URL), 그 본문, 그리고 이를 정리하기 위해 만든 분류와 태그.',
            '환경설정: 언어 설정 등 앱을 사용하기 위한 설정값.',
            '서비스는 위치 정보, 연락처, 결제 정보를 수집하지 않으며, 별도의 분석·추적 도구를 사용하지 않습니다.',
          ],
        },
        {
          heading: '2. 정보의 이용 목적',
          body: [
            '메모와 링크를 저장하고 정리해 다시 보여주는 서비스 본연의 기능을 제공하기 위해 이용합니다.',
            '링크 미리보기: 사용자가 링크를 저장하면, 서비스 서버가 해당 URL에 접속해 제목·설명·대표 이미지 등 공개된 정보를 가져와 미리보기를 만듭니다. 이 과정에서 사용자가 저장한 URL이 서버에서 처리됩니다.',
            '계정 인증과 보안 유지, 이메일 인증 및 비밀번호 재설정을 위한 이메일 발송에 이용합니다.',
          ],
        },
        {
          heading: '3. 제3자 제공 및 처리위탁',
          body: [
            '서비스는 이용자의 개인정보를 제3자에게 판매하거나 마케팅 목적으로 공유하지 않습니다.',
            '서비스 운영에 필요한 범위에서 다음이 관여합니다: 소셜 로그인 제공자(로그인을 선택한 경우), 이메일 발송 대행 서비스(인증·재설정 메일), 그리고 링크 미리보기를 위해 사용자가 저장한 URL이 가리키는 외부 웹사이트.',
            '서비스에는 광고가 없으며, 제3자 광고·분석·추적 SDK를 포함하지 않습니다.',
          ],
        },
        {
          heading: '4. 보관 및 파기',
          body: [
            '개인정보는 이용자가 계정을 유지하는 동안 보관하며, 서비스 제공에 필요한 기간 동안만 이용합니다.',
            '이용자가 계정을 삭제(탈퇴)하면 관련 개인정보와 콘텐츠를 지체 없이 파기합니다. 다만 관련 법령에 따라 보관이 요구되는 정보는 해당 기간 동안 보관할 수 있습니다.',
          ],
        },
        {
          heading: '5. 이용자의 권리',
          body: [
            '이용자는 언제든지 자신의 개인정보와 저장한 콘텐츠를 열람·수정·삭제할 수 있으며, 계정을 삭제해 처리 중단을 요청할 수 있습니다.',
            '권리 행사는 앱 내 기능을 통하거나 아래 문의처로 요청할 수 있습니다.',
          ],
        },
        {
          heading: '6. 아동의 개인정보',
          body: [
            '서비스는 아동을 대상으로 하지 않으며, 관련 법령이 정한 연령 미만 아동의 개인정보를 고의로 수집하지 않습니다.',
          ],
        },
        {
          heading: '7. 방침의 변경',
          body: [
            '본 방침은 법령이나 서비스 변경에 따라 개정될 수 있으며, 중요한 변경이 있을 경우 서비스 내 공지 등을 통해 알립니다.',
          ],
        },
        {
          heading: '8. 문의',
          body: [
            '개인정보 처리에 관한 문의는 다음으로 연락해 주세요: [문의 이메일 주소]',
          ],
        },
      ],
      effectiveNote: '본 개인정보처리방침은 [시행일]부터 시행됩니다.',
    },
    terms: {
      title: '이용약관',
      lastUpdatedLabel: '최종 수정일',
      lastUpdated: '[최종 수정일]',
      intro: [
        '본 약관은 slash(이하 "서비스") 이용에 관한 서비스와 이용자 간의 권리·의무 및 책임 사항을 규정합니다. 서비스를 이용하면 본 약관에 동의한 것으로 봅니다.',
      ],
      sections: [
        {
          heading: '1. 서비스 내용',
          body: [
            'slash는 사용자가 자신에게 보내는 메모와 링크를 저장하고 분류·태그로 정리하도록 돕는 개인용 도구입니다.',
            '서비스는 무료로 제공되며, 광고와 결제 기능이 없습니다.',
          ],
        },
        {
          heading: '2. 계정',
          body: [
            '이용자는 이메일과 비밀번호로 가입하거나 소셜 로그인으로 계정을 만들 수 있습니다.',
            '이용자는 자신의 계정 정보를 안전하게 관리할 책임이 있으며, 계정의 부정 사용을 알게 된 경우 즉시 알려야 합니다.',
          ],
        },
        {
          heading: '3. 이용자의 의무',
          body: [
            '이용자는 관련 법령을 위반하거나 타인의 권리를 침해하는 콘텐츠를 저장·전송하지 않아야 합니다.',
            '이용자는 서비스의 정상적인 운영을 방해하거나 시스템에 무단으로 접근하려는 행위를 해서는 안 됩니다.',
          ],
        },
        {
          heading: '4. 콘텐츠의 권리',
          body: [
            '이용자가 서비스에 저장한 메모·링크 등 콘텐츠에 대한 권리는 이용자에게 있습니다.',
            '이용자는 서비스가 해당 콘텐츠를 저장·정리·표시하고 링크 미리보기를 생성하는 등 서비스 제공에 필요한 범위에서 처리하는 것에 동의합니다.',
          ],
        },
        {
          heading: '5. 서비스의 변경 및 중단',
          body: [
            '서비스는 운영상·기술상 필요에 따라 서비스의 전부 또는 일부를 변경하거나 중단할 수 있으며, 중요한 변경 시 사전에 안내하도록 노력합니다.',
          ],
        },
        {
          heading: '6. 면책',
          body: [
            '서비스는 "있는 그대로" 제공되며, 특정 목적에의 적합성이나 무중단·무오류를 보증하지 않습니다.',
            '링크 미리보기에 표시되는 제목·설명·이미지 등은 외부 웹사이트가 제공하는 정보로, 서비스는 그 정확성이나 적법성에 대해 책임지지 않습니다.',
          ],
        },
        {
          heading: '7. 약관의 변경',
          body: [
            '서비스는 필요 시 본 약관을 개정할 수 있으며, 개정 시 서비스 내 공지 등을 통해 알립니다. 변경된 약관은 공지에서 정한 시점부터 효력이 발생합니다.',
          ],
        },
        {
          heading: '8. 준거법 및 분쟁 해결',
          body: [
            '본 약관과 서비스 이용에 관한 사항은 관련 법령에 따르며, 분쟁이 발생한 경우 관계 법령이 정한 절차에 따라 해결합니다.',
          ],
        },
        {
          heading: '9. 문의',
          body: [
            '약관에 관한 문의는 다음으로 연락해 주세요: [문의 이메일 주소]',
          ],
        },
      ],
      effectiveNote: '본 약관은 [시행일]부터 시행됩니다.',
    },
  },

  // ── English ──
  en: {
    privacy: {
      title: 'Privacy Policy',
      lastUpdatedLabel: 'Last updated',
      lastUpdated: '[Last updated date]',
      intro: [
        'slash ("the Service") values your privacy and complies with applicable laws. This Privacy Policy explains what information the Service collects, how it is used, and how it is protected.',
        'slash is a personal tool that helps you save and organize the notes and links you send to yourself.',
      ],
      sections: [
        {
          heading: '1. Information We Collect',
          body: [
            'Account information: your email address, your password (stored encrypted), the identifier issued by a social login provider if you sign up that way, and the display name you set.',
            'Content you create: the notes and links (URLs) you save, their contents, and the categories and tags you create to organize them.',
            'Preferences: settings needed to use the app, such as your language preference.',
            'The Service does not collect location data, contacts, or payment information, and does not use any separate analytics or tracking tools.',
          ],
        },
        {
          heading: '2. How We Use Information',
          body: [
            'We use it to provide the core function of the Service: saving, organizing, and displaying your notes and links.',
            'Link previews: when you save a link, the Service server accesses that URL to retrieve publicly available information such as its title, description, and thumbnail image in order to build a preview. During this process, the URL you saved is handled on the server.',
            'We use it to authenticate accounts, maintain security, and send emails for email verification and password resets.',
          ],
        },
        {
          heading: '3. Third Parties and Processing',
          body: [
            'The Service does not sell your personal information to third parties or share it for marketing purposes.',
            'The following are involved only as needed to operate the Service: your social login provider (if you choose social login), an email delivery service (for verification and reset emails), and the external websites that the URLs you save point to, for the purpose of generating link previews.',
            'The Service contains no advertising and includes no third-party advertising, analytics, or tracking SDKs.',
          ],
        },
        {
          heading: '4. Retention and Deletion',
          body: [
            'Personal information is retained while you maintain your account and is used only for as long as needed to provide the Service.',
            'When you delete your account, related personal information and content are deleted without undue delay, except where retention is required by applicable law.',
          ],
        },
        {
          heading: '5. Your Rights',
          body: [
            'You may access, correct, or delete your personal information and saved content at any time, and you may delete your account to stop further processing.',
            'You can exercise these rights through in-app features or by contacting us at the address below.',
          ],
        },
        {
          heading: "6. Children's Privacy",
          body: [
            'The Service is not directed at children and does not knowingly collect personal information from children under the age set by applicable law.',
          ],
        },
        {
          heading: '7. Changes to This Policy',
          body: [
            'This Policy may be revised in response to changes in law or the Service. We will notify you of material changes, for example through an in-app notice.',
          ],
        },
        {
          heading: '8. Contact',
          body: [
            'For questions about the handling of personal information, please contact: [Contact email address]',
          ],
        },
      ],
      effectiveNote: 'This Privacy Policy takes effect on [Effective date].',
    },
    terms: {
      title: 'Terms of Service',
      lastUpdatedLabel: 'Last updated',
      lastUpdated: '[Last updated date]',
      intro: [
        'These Terms govern the rights, obligations, and responsibilities between slash ("the Service") and you regarding your use of the Service. By using the Service, you agree to these Terms.',
      ],
      sections: [
        {
          heading: '1. The Service',
          body: [
            'slash is a personal tool that helps you save the notes and links you send to yourself and organize them with categories and tags.',
            'The Service is provided free of charge and has no advertising or payment features.',
          ],
        },
        {
          heading: '2. Accounts',
          body: [
            'You may sign up with an email and password, or create an account using social login.',
            'You are responsible for keeping your account credentials secure and must notify us immediately if you become aware of any unauthorized use of your account.',
          ],
        },
        {
          heading: '3. Your Responsibilities',
          body: [
            'You must not save or transmit content that violates applicable law or infringes the rights of others.',
            'You must not interfere with the normal operation of the Service or attempt to access its systems without authorization.',
          ],
        },
        {
          heading: '4. Rights in Content',
          body: [
            'You retain the rights to the content you save to the Service, such as notes and links.',
            'You agree that the Service may process that content as needed to provide the Service, including storing, organizing, and displaying it and generating link previews.',
          ],
        },
        {
          heading: '5. Changes and Discontinuation',
          body: [
            'The Service may change or discontinue all or part of the Service for operational or technical reasons, and will endeavor to give advance notice of material changes.',
          ],
        },
        {
          heading: '6. Disclaimer',
          body: [
            'The Service is provided "as is," without warranty of fitness for a particular purpose or of uninterrupted or error-free operation.',
            'Titles, descriptions, images, and other details shown in link previews are information provided by external websites; the Service is not responsible for their accuracy or legality.',
          ],
        },
        {
          heading: '7. Changes to These Terms',
          body: [
            'The Service may revise these Terms when necessary and will notify you, for example through an in-app notice. Revised Terms take effect from the time stated in the notice.',
          ],
        },
        {
          heading: '8. Governing Law and Disputes',
          body: [
            'Matters relating to these Terms and use of the Service are subject to applicable law, and any disputes will be resolved through the procedures set out in the relevant laws.',
          ],
        },
        {
          heading: '9. Contact',
          body: [
            'For questions about these Terms, please contact: [Contact email address]',
          ],
        },
      ],
      effectiveNote: 'These Terms take effect on [Effective date].',
    },
  },

  // ── 日本語 ──
  ja: {
    privacy: {
      title: 'プライバシーポリシー',
      lastUpdatedLabel: '最終更新日',
      lastUpdated: '[最終更新日]',
      intro: [
        'slash(以下「本サービス」）は利用者のプライバシーを尊重し、関連法令を遵守します。本プライバシーポリシーは、本サービスがどのような情報を収集し、どのように利用し、どのように保護するかを説明します。',
        'slash は、利用者が自分自身へ送るメモやリンクを保存・整理するための個人用ツールです。',
      ],
      sections: [
        {
          heading: '1. 収集する情報',
          body: [
            'アカウント情報：メールアドレス、パスワード（暗号化して保存）、ソーシャルログインで登録した場合は当該提供者が発行する識別子、および利用者が設定した表示名。',
            '利用コンテンツ：利用者が保存したメモやリンク（URL）、その本文、およびそれらを整理するために作成したカテゴリやタグ。',
            '設定：言語設定など、アプリを利用するための設定値。',
            '本サービスは位置情報・連絡先・決済情報を収集せず、別途の分析・追跡ツールを使用しません。',
          ],
        },
        {
          heading: '2. 情報の利用目的',
          body: [
            'メモやリンクを保存・整理して再表示するという、本サービス本来の機能を提供するために利用します。',
            'リンクプレビュー：利用者がリンクを保存すると、本サービスのサーバーが当該 URL にアクセスし、タイトル・説明・代表画像などの公開情報を取得してプレビューを生成します。この処理の過程で、利用者が保存した URL がサーバー上で処理されます。',
            'アカウント認証とセキュリティの維持、メール認証およびパスワード再設定のためのメール送信に利用します。',
          ],
        },
        {
          heading: '3. 第三者提供および処理の委託',
          body: [
            '本サービスは利用者の個人情報を第三者に販売したり、マーケティング目的で共有したりしません。',
            '本サービスの運営に必要な範囲で、次のものが関与します：ソーシャルログイン提供者（ソーシャルログインを選択した場合）、メール送信代行サービス（認証・再設定メール）、およびリンクプレビュー生成のために利用者が保存した URL が指す外部ウェブサイト。',
            '本サービスに広告はなく、第三者の広告・分析・追跡 SDK を含みません。',
          ],
        },
        {
          heading: '4. 保管および破棄',
          body: [
            '個人情報は利用者がアカウントを維持している間保管し、本サービスの提供に必要な期間のみ利用します。',
            '利用者がアカウントを削除（退会）した場合、関連する個人情報およびコンテンツを遅滞なく破棄します。ただし、関連法令により保管が求められる情報は当該期間保管することがあります。',
          ],
        },
        {
          heading: '5. 利用者の権利',
          body: [
            '利用者はいつでも自身の個人情報および保存したコンテンツを閲覧・修正・削除でき、アカウントを削除して処理の停止を求めることができます。',
            '権利の行使は、アプリ内機能を通じて、または下記の問い合わせ先へご連絡ください。',
          ],
        },
        {
          heading: '6. 子どものプライバシー',
          body: [
            '本サービスは子どもを対象としておらず、関連法令が定める年齢未満の子どもの個人情報を故意に収集しません。',
          ],
        },
        {
          heading: '7. 本ポリシーの変更',
          body: [
            '本ポリシーは法令や本サービスの変更に応じて改定されることがあり、重要な変更がある場合はサービス内のお知らせ等を通じて通知します。',
          ],
        },
        {
          heading: '8. お問い合わせ',
          body: [
            '個人情報の取り扱いに関するお問い合わせは、次までご連絡ください：[お問い合わせ用メールアドレス]',
          ],
        },
      ],
      effectiveNote: '本プライバシーポリシーは [施行日] から施行されます。',
    },
    terms: {
      title: '利用規約',
      lastUpdatedLabel: '最終更新日',
      lastUpdated: '[最終更新日]',
      intro: [
        '本規約は、slash(以下「本サービス」）の利用に関する本サービスと利用者との間の権利・義務および責任事項を定めます。本サービスを利用することで、本規約に同意したものとみなします。',
      ],
      sections: [
        {
          heading: '1. サービス内容',
          body: [
            'slash は、利用者が自分自身へ送るメモやリンクを保存し、カテゴリやタグで整理するための個人用ツールです。',
            '本サービスは無料で提供され、広告および決済機能はありません。',
          ],
        },
        {
          heading: '2. アカウント',
          body: [
            '利用者はメールアドレスとパスワードで登録するか、ソーシャルログインでアカウントを作成できます。',
            '利用者は自身のアカウント情報を安全に管理する責任を負い、アカウントの不正利用を知った場合は直ちに通知するものとします。',
          ],
        },
        {
          heading: '3. 利用者の義務',
          body: [
            '利用者は、関連法令に違反し、または他者の権利を侵害するコンテンツを保存・送信してはなりません。',
            '利用者は、本サービスの正常な運営を妨げ、またはシステムへ無断でアクセスしようとする行為をしてはなりません。',
          ],
        },
        {
          heading: '4. コンテンツの権利',
          body: [
            '利用者が本サービスに保存したメモ・リンク等のコンテンツに関する権利は利用者に帰属します。',
            '利用者は、本サービスが当該コンテンツを保存・整理・表示し、リンクプレビューを生成するなど、サービス提供に必要な範囲で処理することに同意します。',
          ],
        },
        {
          heading: '5. サービスの変更および中断',
          body: [
            '本サービスは運営上・技術上の必要に応じて、本サービスの全部または一部を変更・中断することがあり、重要な変更の際は事前に案内するよう努めます。',
          ],
        },
        {
          heading: '6. 免責',
          body: [
            '本サービスは「現状有姿」で提供され、特定目的への適合性や無中断・無誤りを保証しません。',
            'リンクプレビューに表示されるタイトル・説明・画像等は外部ウェブサイトが提供する情報であり、本サービスはその正確性や適法性について責任を負いません。',
          ],
        },
        {
          heading: '7. 規約の変更',
          body: [
            '本サービスは必要に応じて本規約を改定でき、改定の際はサービス内のお知らせ等を通じて通知します。変更後の規約は、お知らせで定めた時点から効力を生じます。',
          ],
        },
        {
          heading: '8. 準拠法および紛争解決',
          body: [
            '本規約および本サービスの利用に関する事項は関連法令に従い、紛争が生じた場合は関係法令が定める手続きに従って解決します。',
          ],
        },
        {
          heading: '9. お問い合わせ',
          body: [
            '規約に関するお問い合わせは、次までご連絡ください：[お問い合わせ用メールアドレス]',
          ],
        },
      ],
      effectiveNote: '本規約は [施行日] から施行されます。',
    },
  },
};
