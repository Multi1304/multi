import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- SEEDING ULTRA STABLE V2 FLOWS (CONTRACT SAFE) ---');

    const tenant = await prisma.tenant.findUnique({ where: { slug: 'dev' } });
    if (!tenant) throw new Error('Tenant "dev" not found');

    const user = await prisma.user.findFirst({ where: { email: 'admin@local' } });
    if (!user) throw new Error('Admin user not found');

    const v2Flow = {
        id: 'flow-v2-hotmail-optimized',
        name: 'Hotmail Ultra-Stable V2',
        description: 'V2 structure with complete Hotmail-to-Inbox sequence. Contract-Safe.',
        isPublic: true,
        steps: [
            {
                id: 'step_00_identity',
                order: 0,
                type: 'prompt',
                config: {
                    prompt: "Genera una IDENTIDAD COMPLETA para Microsoft. Lista de variables: username, password, firstName, lastName, name, surname, random8, random16_complex, birthMonth, birthDay, birthYear"
                }
            },
            {
                id: 'step_01_navigate',
                order: 1,
                type: 'navigate',
                config: {
                    url: 'https://signup.live.com/signup',
                    expectedAfterStage: 'username'
                }
            },
            {
                id: 'step_02_type_username',
                order: 2,
                type: 'type',
                config: {
                    selector: 'input[name="MemberName"]',
                    text: '{{username}}',
                    expectedAfterStage: 'username'
                }
            },
            {
                id: 'step_03_click_next',
                order: 3,
                type: 'click',
                config: {
                    selector: 'input[type="submit"], #iSignupAction',
                    expectedAfterStage: 'password'
                }
            },
            {
                id: 'step_04_type_password',
                order: 4,
                type: 'type',
                config: {
                    selector: 'input[name="Password"]',
                    text: '{{password}}',
                    expectedAfterStage: 'password'
                }
            },
            {
                id: 'step_05_click_next_pw',
                order: 5,
                type: 'click',
                config: {
                    selector: 'input[type="submit"], #iSignupAction',
                    expectedAfterStage: 'name'
                }
            },
            {
                id: 'step_06_type_first_name',
                order: 6,
                type: 'type',
                config: {
                    selector: 'input[name="FirstName"]',
                    text: '{{firstName}}'
                }
            },
            {
                id: 'step_07_type_last_name',
                order: 7,
                type: 'type',
                config: {
                    selector: 'input[name="LastName"]',
                    text: '{{lastName}}'
                }
            },
            {
                id: 'step_08_click_next_name',
                order: 8,
                type: 'click',
                config: {
                    selector: 'input[type="submit"], #iSignupAction',
                    expectedAfterStage: 'birthdate'
                }
            },
            {
                id: 'step_09_select_birth_month',
                order: 9,
                type: 'select',
                config: {
                    selector: '#BirthMonth',
                    value: '{{birthMonth}}'
                }
            },
            {
                id: 'step_10_type_birth_day',
                order: 10,
                type: 'type',
                config: {
                    selector: '#BirthDay',
                    text: '{{birthDay}}'
                }
            },
            {
                id: 'step_11_type_birth_year',
                order: 11,
                type: 'type',
                config: {
                    selector: '#BirthYear',
                    text: '{{birthYear}}'
                }
            },
            {
                id: 'step_12_click_final_next',
                order: 12,
                type: 'click',
                config: {
                    selector: 'input[type="submit"], #iSignupAction',
                    expectedAfterStage: 'captcha'
                }
            },
            {
                id: 'step_13_wait_arkose',
                order: 13,
                type: 'wait_for_selector',
                config: {
                    selector: 'iframe[src*="arkoselabs"], #enforcementFrame, #root',
                    timeout: 60000,
                    optional: true
                }
            },
            {
                id: 'step_14_wait_success_redirect',
                order: 14,
                type: 'wait_for_selector',
                config: {
                    selector: '#acceptButton, #idSIButton9, #idBtn_Back, .inner_container',
                    timeout: 120000,
                    optional: true
                }
            },
            {
                id: 'step_15_handle_stay_signed_in',
                order: 15,
                type: 'click',
                config: {
                    selector: '#acceptButton, #idSIButton9',
                    optional: true
                }
            },
            {
                id: 'step_16_navigate_inbox',
                order: 16,
                type: 'navigate',
                config: {
                    url: 'https://outlook.live.com/mail/0/',
                    expectedAfterStage: 'inbox'
                }
            },
            {
                id: 'step_17_verify_inbox',
                order: 17,
                type: 'wait_for_selector',
                config: {
                    selector: '#app, ._3m5m, ._2I_N',
                    timeout: 45000
                }
            }
        ]
    };

    console.log(`Upserting Contract-Safe Flow: ${v2Flow.name}`);
    await (prisma as any).flow.upsert({
        where: { id: v2Flow.id },
        update: {
            steps: v2Flow.steps,
            description: v2Flow.description
        },
        create: {
            id: v2Flow.id,
            name: v2Flow.name,
            description: v2Flow.description,
            steps: v2Flow.steps,
            tenantId: tenant.id,
            userId: user.id,
            isPublic: true
        }
    });

    console.log('V2 Flow successfully re-seeded with contract-safe prompts.');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
