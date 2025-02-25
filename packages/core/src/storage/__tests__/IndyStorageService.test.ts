import type { TagsBase } from '../BaseRecord'
import type { default as Indy } from 'indy-sdk'

import { getAgentConfig } from '../../../tests/helpers'
import { RecordDuplicateError, RecordNotFoundError } from '../../error'
import { IndyWallet } from '../../wallet/IndyWallet'
import { IndyStorageService } from '../IndyStorageService'

import { TestRecord } from './TestRecord'

describe('IndyStorageService', () => {
  let wallet: IndyWallet
  let indy: typeof Indy
  let storageService: IndyStorageService<TestRecord>

  beforeEach(async () => {
    const config = getAgentConfig('IndyStorageServiceTest')
    indy = config.agentDependencies.indy
    wallet = new IndyWallet(config)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await wallet.initialize(config.walletConfig!)
    storageService = new IndyStorageService<TestRecord>(wallet, config)
  })

  afterEach(async () => {
    await wallet.delete()
  })

  const insertRecord = async ({ id, tags }: { id?: string; tags?: TagsBase }) => {
    const props = {
      id,
      foo: 'bar',
      tags: tags ?? { myTag: 'foobar' },
    }
    const record = new TestRecord(props)
    await storageService.save(record)
    return record
  }

  describe('tag transformation', () => {
    it('should correctly transform tag values to string before storing', async () => {
      const record = await insertRecord({
        id: 'test-id',
        tags: {
          someBoolean: true,
          someOtherBoolean: false,
          someStringValue: 'string',
        },
      })

      const retrieveRecord = await indy.getWalletRecord(wallet.handle, record.type, record.id, {
        retrieveType: true,
        retrieveTags: true,
      })

      expect(retrieveRecord.tags).toEqual({
        someBoolean: '1',
        someOtherBoolean: '0',
        someStringValue: 'string',
      })
    })

    it('should correctly transform tag values from string after retrieving', async () => {
      await indy.addWalletRecord(wallet.handle, TestRecord.type, 'some-id', '{}', {
        someBoolean: '1',
        someOtherBoolean: '0',
        someStringValue: 'string',
      })

      const record = await storageService.getById(TestRecord, 'some-id')

      expect(record.getTags()).toEqual({
        someBoolean: true,
        someOtherBoolean: false,
        someStringValue: 'string',
      })
    })
  })

  describe('save()', () => {
    it('should throw RecordDuplicateError if a record with the id already exists', async () => {
      const record = await insertRecord({ id: 'test-id' })

      return expect(() => storageService.save(record)).rejects.toThrowError(RecordDuplicateError)
    })

    it('should save the record', async () => {
      const record = await insertRecord({ id: 'test-id' })
      const found = await storageService.getById(TestRecord, 'test-id')

      expect(record).toEqual(found)
    })
  })

  describe('getById()', () => {
    it('should throw RecordNotFoundError if the record does not exist', async () => {
      return expect(() => storageService.getById(TestRecord, 'does-not-exist')).rejects.toThrowError(
        RecordNotFoundError
      )
    })

    it('should return the record by id', async () => {
      const record = await insertRecord({ id: 'test-id' })
      const found = await storageService.getById(TestRecord, 'test-id')

      expect(found).toEqual(record)
    })
  })

  describe('update()', () => {
    it('should throw RecordNotFoundError if the record does not exist', async () => {
      const record = new TestRecord({
        id: 'test-id',
        foo: 'test',
        tags: { some: 'tag' },
      })

      return expect(() => storageService.update(record)).rejects.toThrowError(RecordNotFoundError)
    })

    it('should update the record', async () => {
      const record = await insertRecord({ id: 'test-id' })

      record.replaceTags({ ...record.getTags(), foo: 'bar' })
      record.foo = 'foobaz'
      await storageService.update(record)

      const retrievedRecord = await storageService.getById(TestRecord, record.id)
      expect(retrievedRecord).toEqual(record)
    })
  })

  describe('delete()', () => {
    it('should throw RecordNotFoundError if the record does not exist', async () => {
      const record = new TestRecord({
        id: 'test-id',
        foo: 'test',
        tags: { some: 'tag' },
      })

      return expect(() => storageService.delete(record)).rejects.toThrowError(RecordNotFoundError)
    })

    it('should delete the record', async () => {
      const record = await insertRecord({ id: 'test-id' })
      await storageService.delete(record)

      return expect(() => storageService.getById(TestRecord, record.id)).rejects.toThrowError(RecordNotFoundError)
    })
  })

  describe('getAll()', () => {
    it('should retrieve all records', async () => {
      const createdRecords = await Promise.all(
        Array(5)
          .fill(undefined)
          .map((_, index) => insertRecord({ id: `record-${index}` }))
      )

      const records = await storageService.getAll(TestRecord)

      expect(records).toEqual(expect.arrayContaining(createdRecords))
    })
  })

  describe('findByQuery()', () => {
    it('should retrieve all records that match the query', async () => {
      const expectedRecord = await insertRecord({ tags: { myTag: 'foobar' } })
      await insertRecord({ tags: { myTag: 'notfoobar' } })

      const records = await storageService.findByQuery(TestRecord, { myTag: 'foobar' })

      expect(records.length).toBe(1)
      expect(records[0]).toEqual(expectedRecord)
    })
  })
})
